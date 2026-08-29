import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { EscanerCamara } from '@/components/escaner-camara';
import { ETIQUETAS_CATEGORIA } from '@/components/ingresos-gastos';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import {
  confirmarInventario,
  descartarInventario,
  escanearInventario,
  mensajeError,
  type BorradorEscaneo,
  type CorreccionTicket,
  type ResultadoConfirmarInventario,
} from '@/lib/api';

// Réplica de /panel/obrador (sub-sección Inventario) -- un solo botón "📷 Escanear",
// la IA de ninuma-agente decide sola si es ticket de compra o albarán propio. No hay
// edición línea a línea (tampoco la hay en el panel): se confirma tal cual o se
// vuelve a escanear si algo está mal.

type Paso = 'camara' | 'leyendo' | 'revisar' | 'confirmando' | 'hecho';

export function InventarioEscaner({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [paso, setPaso] = useState<Paso>('camara');
  const [borrador, setBorrador] = useState<BorradorEscaneo | null>(null);
  const [resultado, setResultado] = useState<ResultadoConfirmarInventario | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Correcciones que Ariadna puede hacer antes de confirmar un ticket (categoría de
  // gasto, desglose de IVA) -- solo se rellena cuando el borrador es ticket_compra,
  // ver sincronización con setBorrador en alHacerFoto.
  const [correccion, setCorreccion] = useState<CorreccionTicket>({});

  // Botón/gesto de "atrás" de Android -- retrocede un paso (o vuelve a escanear) en
  // vez de salir directo a Obrador (bug real: Ariadna, 2026-08-23).
  useVolverAtras(paso === 'camara', () => (paso === 'hecho' ? onVolver() : volverAEscanear()));

  async function alHacerFoto(uri: string) {
    setPaso('leyendo');
    setError(null);
    try {
      const nuevoBorrador = await escanearInventario(uri);
      setBorrador(nuevoBorrador);
      setCorreccion(
        nuevoBorrador.tipo === 'ticket_compra'
          ? {
              categoria: nuevoBorrador.categoria ?? 'otros',
              base_imponible: nuevoBorrador.base_imponible ?? undefined,
              iva_importe: nuevoBorrador.iva_importe ?? undefined,
              iva_porcentaje: nuevoBorrador.iva_porcentaje ?? undefined,
            }
          : {}
      );
      setPaso('revisar');
    } catch (err) {
      // Bug real, Ariadna 2026-08-29: "subir una foto ya hecha no hace nada, solo
      // vuelve a la cámara" -- el `paso === 'camara'` de más abajo hace un return
      // temprano que nunca llega a pintar el bloque de {error && ...}, así que un
      // fallo de verdad (red, imagen ilegible, timeout) quedaba completamente
      // silencioso. Un Alert sí se ve siempre, sea cual sea el paso.
      Alert.alert('No se ha podido leer la foto', mensajeError(err));
      setError(mensajeError(err));
      setPaso('camara');
    }
  }

  async function confirmar() {
    if (!borrador) return;
    setPaso('confirmando');
    setError(null);
    try {
      const res = await confirmarInventario(borrador.id, borrador.tipo === 'ticket_compra' ? correccion : undefined);
      if (!res.ok) {
        setError(res.error ?? 'No se ha podido confirmar.');
        setPaso('revisar');
        return;
      }
      setResultado(res);
      setPaso('hecho');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('revisar');
    }
  }

  async function volverAEscanear() {
    if (borrador) {
      try {
        await descartarInventario(borrador.id);
      } catch {
        // no bloquea volver a escanear aunque falle el descarte
      }
    }
    setBorrador(null);
    setCorreccion({});
    setError(null);
    setPaso('camara');
  }

  if (paso === 'camara') return <EscanerCamara onFoto={alHacerFoto} onCancelar={onVolver} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Obrador
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Inventario
          </ThemedText>

          {paso === 'leyendo' && (
            <View style={styles.centro}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">Leyendo la foto...</ThemedText>
            </View>
          )}

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {error}
            </ThemedText>
          )}

          {paso === 'hecho' && resultado && (
            <View style={styles.centro}>
              <ThemedText type="default">
                {resultado.numero
                  ? `✅ Albarán ${resultado.numero} registrado en contabilidad.`
                  : resultado.categoria === 'materia_prima'
                    ? `✅ ${resultado.sumadas?.length ?? 0} producto(s) actualizados en Grocy, y registrado como gasto.`
                    : resultado.categoria
                      ? `✅ Registrado como gasto (${ETIQUETAS_CATEGORIA[resultado.categoria] ?? resultado.categoria}). No toca el stock.`
                      : `✅ ${resultado.sumadas?.length ?? 0} receta(s) descontadas del stock.`}
              </ThemedText>
              {!!resultado.sin_emparejar?.length && (
                <ThemedText type="small" themeColor="danger" style={styles.aviso}>
                  ❌ No se han podido emparejar (no se han tocado): {resultado.sin_emparejar.join(', ')}
                </ThemedText>
              )}
              <BotonPrimario texto="Volver a Obrador" onPress={onVolver} />
            </View>
          )}

          {(paso === 'revisar' || paso === 'confirmando') && borrador && (
            <RevisionBorrador borrador={borrador} correccion={correccion} onCambiarCorreccion={setCorreccion} theme={theme} />
          )}
        </ScrollView>

        {(paso === 'revisar' || paso === 'confirmando') && (
          <View style={styles.pie}>
            <View style={styles.filaBotones}>
              <Pressable onPress={volverAEscanear} disabled={paso === 'confirmando'} style={[styles.botonRescan, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">🔄 Volver a escanear</ThemedText>
              </Pressable>
              <View style={styles.botonConfirmar}>
                <BotonPrimario texto="✅ Confirmar" onPress={confirmar} cargando={paso === 'confirmando'} />
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function RevisionBorrador({
  borrador,
  correccion,
  onCambiarCorreccion,
  theme,
}: {
  borrador: BorradorEscaneo;
  correccion: CorreccionTicket;
  onCambiarCorreccion: (c: CorreccionTicket) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  if (borrador.tipo === 'ticket_compra') {
    const etiqueta = `Ticket de compra${borrador.proveedor ? ` · ${borrador.proveedor}` : ' · proveedor sin identificar'}`;
    const esMateriaPrima = correccion.categoria === 'materia_prima';
    return (
      <>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>{etiqueta.toUpperCase()}</ThemedText>

        <ThemedText type="small" themeColor="textSecondary">Categoría del gasto</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsCategoria}>
          {Object.entries(ETIQUETAS_CATEGORIA).map(([valor, texto]) => (
            <Pressable
              key={valor}
              onPress={() => onCambiarCorreccion({ ...correccion, categoria: valor })}
              style={[styles.chip, { borderColor: correccion.categoria === valor ? theme.accent : theme.separator }]}>
              <ThemedText type="small" style={{ color: correccion.categoria === valor ? theme.accent : theme.textSecondary }}>{texto}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        {esMateriaPrima ? (
          borrador.lineas.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">No he leído ninguna línea con claridad.</ThemedText>
          ) : (
            <ListCard>
              {borrador.lineas.map((l, i) => {
                const icono = !l.es_producto ? '➖' : l.product_id !== null ? '✅' : '❌';
                const nota = !l.es_producto
                  ? 'gasto, no es stock'
                  : l.product_id !== null
                    ? `se sumará a «${l.nombre_grocy ?? l.descripcion}»`
                    : 'no lo he podido emparejar, no se tocará';
                return (
                  <ListRow
                    key={`${l.descripcion}-${i}`}
                    last={i === borrador.lineas.length - 1}
                    title={`${icono} ${l.descripcion}`}
                    subtitle={nota}
                    right={<ThemedText type="small" themeColor="textSecondary">×{l.cantidad}</ThemedText>}
                  />
                );
              })}
            </ListCard>
          )
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.leyenda}>
            Esta categoría no toca el stock -- solo se registra como gasto.
          </ThemedText>
        )}
        {esMateriaPrima && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.leyenda}>
            ✅ se sumará a inventario · ❌ no se ha podido emparejar (no se toca) · ➖ gasto, no es mercancía.
          </ThemedText>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.seccion}>
          Desglose de IVA {borrador.iva_importe === null && '(no leído en el ticket -- corrígelo si lo sabes)'}
        </ThemedText>
        <View style={styles.filaIva}>
          <View style={styles.campoIva}>
            <ThemedText type="small" themeColor="textSecondary">Base imponible</ThemedText>
            <TextInput
              value={correccion.base_imponible?.toString() ?? ''}
              onChangeText={(t) => onCambiarCorreccion({ ...correccion, base_imponible: t ? parseFloat(t.replace(',', '.')) : undefined })}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              style={[styles.inputIva, { color: theme.text, borderColor: theme.separator }]}
            />
          </View>
          <View style={styles.campoIva}>
            <ThemedText type="small" themeColor="textSecondary">IVA (%)</ThemedText>
            <TextInput
              value={correccion.iva_porcentaje?.toString() ?? ''}
              onChangeText={(t) => onCambiarCorreccion({ ...correccion, iva_porcentaje: t ? parseFloat(t.replace(',', '.')) : undefined })}
              keyboardType="decimal-pad"
              placeholder="21"
              placeholderTextColor={theme.textSecondary}
              style={[styles.inputIva, { color: theme.text, borderColor: theme.separator }]}
            />
          </View>
          <View style={styles.campoIva}>
            <ThemedText type="small" themeColor="textSecondary">IVA (€)</ThemedText>
            <TextInput
              value={correccion.iva_importe?.toString() ?? ''}
              onChangeText={(t) => onCambiarCorreccion({ ...correccion, iva_importe: t ? parseFloat(t.replace(',', '.')) : undefined })}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              style={[styles.inputIva, { color: theme.text, borderColor: theme.separator }]}
            />
          </View>
        </View>
      </>
    );
  }

  const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const etiqueta = `Tu albarán · ${borrador.cliente ?? 'cliente sin identificar'}${borrador.numero ? ` · Nº ${borrador.numero}` : ''}`;
  const sinPrecio = borrador.lineas.filter((l) => l.precio_unitario === null).map((l) => l.descripcion);
  const clienteNuevoIncompleto = !borrador.cliente_conocido && !(borrador.direccion_cliente && borrador.cif_cliente);
  const bloqueado = !borrador.cliente || borrador.lineas.length === 0 || clienteNuevoIncompleto || sinPrecio.length > 0;
  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>{etiqueta.toUpperCase()}</ThemedText>
      {borrador.lineas.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">No he leído ninguna línea con claridad.</ThemedText>
      ) : (
        <ListCard>
          {borrador.lineas.map((l, i) => (
            <ListRow
              key={`${l.descripcion}-${i}`}
              last={i === borrador.lineas.length - 1}
              title={l.descripcion}
              subtitle={`×${l.unidades}${l.precio_unitario === null ? ' · sin precio leído' : ` · ${eur.format(l.precio_unitario)}/ud`}`}
              right={
                <ThemedText type="small" themeColor={l.precio_unitario === null ? 'danger' : 'textSecondary'}>
                  {l.precio_unitario !== null ? eur.format(l.precio_unitario * l.unidades) : '—'}
                </ThemedText>
              }
            />
          ))}
        </ListCard>
      )}
      {!borrador.cliente_conocido && borrador.cliente && (
        <ThemedText type="small" themeColor="danger" style={styles.aviso}>
          ❌ «{borrador.cliente}» no está en tus clientes guardados{borrador.direccion_cliente && borrador.cif_cliente ? ' -- se dará de alta automáticamente al confirmar.' : ', y me falta su dirección/CIF -- créalo antes desde "Nuevo albarán".'}
        </ThemedText>
      )}
      {!!sinPrecio.length && (
        <ThemedText type="small" themeColor="danger" style={styles.aviso}>
          ❌ Sin precio leído: {sinPrecio.join(', ')} -- complétalo desde "Nuevo albarán".
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.leyenda}>
        {bloqueado
          ? 'No se puede registrar automáticamente tal cual -- usa "Nuevo albarán" para completarlo a mano, o vuelve a escanear con una foto más clara.'
          : 'Al confirmar se registra ya en contabilidad con este número y no genera un documento nuevo (el papel ya existe).'}
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.one },
  titulo: { fontSize: 26, lineHeight: 31, marginBottom: Spacing.two },
  centro: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  chipsCategoria: { flexDirection: 'row', marginBottom: Spacing.two },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, marginRight: 6 },
  filaIva: { flexDirection: 'row', gap: Spacing.two },
  campoIva: { flex: 1, gap: 4 },
  inputIva: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  aviso: { lineHeight: 20 },
  seccion: { marginBottom: Spacing.two, letterSpacing: 0.3 },
  leyenda: { marginTop: Spacing.two, lineHeight: 18 },
  pie: { paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset || Spacing.three, paddingTop: Spacing.two },
  filaBotones: { flexDirection: 'row', gap: Spacing.two },
  botonRescan: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  botonConfirmar: { flex: 1 },
});
