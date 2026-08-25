import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { EscanerCamara } from '@/components/escaner-camara';
import { SelectorFechaCalendario } from '@/components/selector-fecha-calendario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha, ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  editarPedido,
  marcarPedidoEntregado,
  marcarPedidoPagado,
  mensajeError,
  obtenerAdjuntosPedido,
  subirAdjuntoPedido,
  type Pedido,
} from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const ESTADO_LABEL: Record<string, string> = {
  recibido: 'Pendiente',
  en_obrador: 'En preparación',
  listo: 'Listo para recoger',
  entregado: 'Entregado',
};
const KIND_LABEL: Record<string, string> = { encargo: 'Encargo', tienda: 'Tienda', edicion: 'Edición especial', b2b: 'B2B' };

/** Réplica de la ficha completa del bot de Telegram para un pedido YA confirmado
 * (ver botonesPedido/botonesEditarFicha en WBD/src/pages/api/telegram-webhook.ts) --
 * Ariadna, 2026-08-25: "quiero poder tratar los pedidos en la app como los trato por
 * el bot, mismas opciones... y una vez que está archivado en Pedidos Particulares
 * poder darle clic y tener acceso a un menú con las mismas opciones que tenía en el
 * bot". Mismos 4 bloques que la tarjeta del bot: ficha editable, pasar a entregado,
 * marcar pagado, adjuntos (foto/PDF del pedido o del albarán de entrega). */
export function PedidoParticularDetalle({ pedido, onVolver }: { pedido: Pedido; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const yaPagado = pedido.payment_status === 'pagado';
  const yaEntregado = pedido.status === 'entregado';

  const [nombre, setNombre] = useState(pedido.cliente === 'Sin nombre' ? '' : pedido.cliente);
  const [telefono, setTelefono] = useState(pedido.guest_telefono ?? '');
  const [nif, setNif] = useState(pedido.nif ?? '');
  const [esEmpresa, setEsEmpresa] = useState(pedido.es_empresa ?? false);
  const [precio, setPrecio] = useState((pedido.total_cents / 100).toFixed(2));
  const [fecha, setFecha] = useState(pedido.recogida_fecha ? pedido.recogida_fecha.slice(0, 10) : '');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<'entregar' | 'pagar' | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [tipoAdjuntoSubir, setTipoAdjuntoSubir] = useState<'pedido' | 'albaran' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adjuntosQuery = useQuery({ queryKey: ['pedido', pedido.id, 'adjuntos'], queryFn: () => obtenerAdjuntosPedido(pedido.id) });

  function invalidarPedidos() {
    queryClient.invalidateQueries({ queryKey: ['pedidos'] });
  }

  async function guardarFicha() {
    const precioNum = !yaPagado && precio.trim() ? Number(precio.replace(',', '.')) : null;
    if (!yaPagado && precio.trim() && Number.isNaN(precioNum)) {
      setError('El precio no es un número válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await editarPedido(pedido.id, {
        ...(!pedido.es_cena && fecha ? { fecha } : {}),
        ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        ...(esEmpresa && nif.trim() ? { nif: nif.trim() } : {}),
        es_empresa: esEmpresa,
        ...(precioNum != null ? { precio_cents: Math.round(precioNum * 100) } : {}),
      });
      invalidarPedidos();
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function pasarAEntregado() {
    setAccionEnCurso('entregar');
    setError(null);
    try {
      await marcarPedidoEntregado(pedido.id);
      invalidarPedidos();
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function marcarPagado() {
    setAccionEnCurso('pagar');
    setError(null);
    try {
      await marcarPedidoPagado(pedido.id);
      invalidarPedidos();
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function alFotografiar(uri: string) {
    const tipo = tipoAdjuntoSubir;
    setTipoAdjuntoSubir(null);
    if (!tipo) return;
    setSubiendoFoto(true);
    setError(null);
    try {
      await subirAdjuntoPedido(pedido.id, tipo, uri);
      await queryClient.invalidateQueries({ queryKey: ['pedido', pedido.id, 'adjuntos'] });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setSubiendoFoto(false);
    }
  }

  if (tipoAdjuntoSubir) {
    return <EscanerCamara onFoto={alFotografiar} onCancelar={() => setTipoAdjuntoSubir(null)} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Pedidos
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {pedido.cliente || 'Sin nombre'}
          </ThemedText>

          <Ficha style={styles.ficha}>
            <FilaFicha etiqueta="Tipo" valor={KIND_LABEL[pedido.kind] ?? pedido.kind} />
            <FilaFicha etiqueta="Localizador" valor={pedido.locator ?? '—'} />
            {pedido.descripcion && <FilaFicha etiqueta="Descripción" valor={pedido.descripcion} multilinea />}
            {pedido.guest_email && <FilaFicha etiqueta="Email" valor={pedido.guest_email} />}
            <FilaFicha etiqueta="Estado" valor={ESTADO_LABEL[pedido.status] ?? pedido.status} />
            <FilaFicha etiqueta="Pago" valor={yaPagado ? '✅ Ya pagado' : '⏳ Pendiente'} last />
          </Ficha>

          {(!yaEntregado || pedido.payment_status === 'pendiente') && (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>ACCIONES</ThemedText>
              <View style={styles.filaAcciones}>
                {!yaEntregado && (
                  <Pressable
                    onPress={pasarAEntregado}
                    disabled={accionEnCurso !== null}
                    style={[styles.botonAccion, { backgroundColor: theme.backgroundElement }]}>
                    {accionEnCurso === 'entregar' ? (
                      <ActivityIndicator color={theme.accent} size="small" />
                    ) : (
                      <ThemedText type="smallBold">➡️ Pasar a Entregado</ThemedText>
                    )}
                  </Pressable>
                )}
                {pedido.payment_status === 'pendiente' && (
                  <Pressable
                    onPress={marcarPagado}
                    disabled={accionEnCurso !== null}
                    style={[styles.botonAccion, { backgroundColor: theme.backgroundElement }]}>
                    {accionEnCurso === 'pagar' ? (
                      <ActivityIndicator color={theme.accent} size="small" />
                    ) : (
                      <ThemedText type="smallBold">💰 Marcar pagado</ThemedText>
                    )}
                  </Pressable>
                )}
              </View>
            </>
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>DATOS DEL CLIENTE</ThemedText>
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder={esEmpresa ? 'Nombre de la empresa' : 'Nombre del cliente'}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <TextInput
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Teléfono"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <View style={styles.filaSwitch}>
              <ThemedText type="small">Es empresa</ThemedText>
              <Switch value={esEmpresa} onValueChange={setEsEmpresa} />
            </View>
            {esEmpresa && (
              <TextInput
                value={nif}
                onChangeText={setNif}
                placeholder="NIF/CIF"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
              />
            )}
            {yaPagado ? (
              <ThemedText type="small" themeColor="textSecondary">
                Precio cobrado: {precio} € (ya pagado, no editable)
              </ThemedText>
            ) : (
              <TextInput
                value={precio}
                onChangeText={setPrecio}
                placeholder="Precio (€)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
              />
            )}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
            {pedido.es_cena ? 'FECHA DE LA CENA' : 'FECHA DE ENTREGA'}
          </ThemedText>
          {pedido.es_cena ? (
            <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText>
                {fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Fija desde la reserva -- no se puede cambiar aquí.
              </ThemedText>
            </View>
          ) : (
            <>
              <Pressable onPress={() => setMostrarCalendario((v) => !v)} style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={!fecha ? { color: theme.textSecondary } : undefined}>
                  {fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Toca para elegir un día en el calendario'}
                </ThemedText>
              </Pressable>
              {mostrarCalendario && (
                <SelectorFechaCalendario
                  fechaSeleccionada={fecha || null}
                  onSeleccionar={(iso) => {
                    setFecha(iso);
                    setMostrarCalendario(false);
                  }}
                />
              )}
            </>
          )}

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="✏️ Guardar ficha" onPress={guardarFicha} cargando={guardando} />
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>ADJUNTOS</ThemedText>
          {adjuntosQuery.isLoading && <ActivityIndicator color={theme.accent} />}
          {!adjuntosQuery.data?.length && !adjuntosQuery.isLoading && (
            <ThemedText type="small" themeColor="textSecondary">Sin adjuntos todavía.</ThemedText>
          )}
          {!!adjuntosQuery.data?.length && (
            <ListCard>
              {adjuntosQuery.data.map((a, i) => (
                <ListRow
                  key={a.id}
                  last={i === adjuntosQuery.data!.length - 1}
                  onPress={() => a.url && Linking.openURL(a.url)}
                  title={a.nombre}
                  subtitle={a.tipo === 'albaran' ? 'Albarán de entrega' : 'Foto/PDF del pedido'}
                />
              ))}
            </ListCard>
          )}
          <View style={styles.filaAcciones}>
            <Pressable
              onPress={() => setTipoAdjuntoSubir('pedido')}
              disabled={subiendoFoto}
              style={[styles.botonAccion, { backgroundColor: theme.backgroundElement }]}>
              {subiendoFoto ? <ActivityIndicator color={theme.accent} size="small" /> : <ThemedText type="smallBold">📎 Foto/PDF del pedido</ThemedText>}
            </Pressable>
            <Pressable
              onPress={() => setTipoAdjuntoSubir('albaran')}
              disabled={subiendoFoto}
              style={[styles.botonAccion, { backgroundColor: theme.backgroundElement }]}>
              {subiendoFoto ? <ActivityIndicator color={theme.accent} size="small" /> : <ThemedText type="smallBold">📎 Albarán de entrega</ThemedText>}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  ficha: { marginTop: Spacing.two },
  seccion: { marginTop: Spacing.three, marginBottom: Spacing.two, letterSpacing: 0.3 },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  error: { marginTop: Spacing.one },
  botonWrap: { marginTop: Spacing.two },
  filaAcciones: { flexDirection: 'row', gap: Spacing.two },
  botonAccion: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
});
