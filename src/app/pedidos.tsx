import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbaranWizard } from '@/components/albaran-wizard';
import { Clientes } from '@/components/clientes';
import { ClienteProfesionalDetalle } from '@/components/cliente-profesional';
import { DocumentosTodos } from '@/components/documentos-todos';
import { PedidoPropioFormulario } from '@/components/pedido-propio-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BotonPrimario } from '@/components/boton-primario';
import { ListCard, ListRow, Pill, SectionLabel, Segmented, type PillColor } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cerrarMes,
  mensajeError,
  obtenerAcumuladoMensualItemizado,
  obtenerClientesProfesionales,
  obtenerPedidos,
  obtenerPedidosPropios,
  obtenerResumen,
  type Pedido,
  type PedidoPropio,
} from '@/lib/api';
import { DocumentoDetalle } from '@/components/documento-detalle';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });

const ETIQUETAS_KIND: Record<string, { texto: string; color: PillColor }> = {
  b2b: { texto: 'B2B', color: 'info' },
  encargo: { texto: 'Particular', color: 'warning' },
};
const ETIQUETAS_ESTADO_PROPIO: Record<string, { texto: string; color: PillColor }> = {
  pendiente: { texto: 'Pendiente', color: 'warning' },
  confirmado: { texto: 'Confirmado', color: 'info' },
  entregado: { texto: 'Entregado', color: 'accent' },
  cobrado: { texto: 'Cobrado', color: 'success' },
};

type Vista =
  | { tipo: 'principal' }
  | { tipo: 'clientes' }
  | { tipo: 'cliente-profesional'; nombre: string }
  | { tipo: 'documentos' }
  | { tipo: 'documento'; numero: string }
  | { tipo: 'form-pedido'; pedido: PedidoPropio | null }
  | { tipo: 'nuevo-albaran' };
type Sub = 'Profesionales' | 'Particulares';

export default function PedidosScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>({ tipo: 'principal' });
  const [sub, setSub] = useState<Sub>('Profesionales');
  const [cerrandoMes, setCerrandoMes] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setVista({ tipo: 'principal' });
    }, []),
  );

  const profesionalesQuery = useQuery({ queryKey: ['clientes-profesionales'], queryFn: obtenerClientesProfesionales });
  const acumuladoItemizadoQuery = useQuery({ queryKey: ['acumulado-mensual-itemizado'], queryFn: obtenerAcumuladoMensualItemizado, enabled: sub === 'Profesionales' });
  const resumenQuery = useQuery({ queryKey: ['resumen'], queryFn: obtenerResumen });
  const webQuery = useQuery({ queryKey: ['pedidos'], queryFn: obtenerPedidos });
  const propiosQuery = useQuery({ queryKey: ['pedidos-propios'], queryFn: obtenerPedidosPropios });

  function volverYRefrescar() {
    setVista({ tipo: 'principal' });
    queryClient.invalidateQueries({ queryKey: ['resumen'] });
    queryClient.invalidateQueries({ queryKey: ['clientes-profesionales'] });
  }

  if (vista.tipo === 'clientes') return <Clientes onVolver={() => setVista({ tipo: 'principal' })} />;
  if (vista.tipo === 'cliente-profesional') {
    return <ClienteProfesionalDetalle nombre={vista.nombre} onVolver={() => setVista({ tipo: 'principal' })} />;
  }
  if (vista.tipo === 'documentos') return <DocumentosTodos onVolver={() => setVista({ tipo: 'principal' })} />;
  if (vista.tipo === 'documento') {
    return <DocumentoDetalle numero={vista.numero} etiquetaVolver="Pedidos" onVolver={() => setVista({ tipo: 'principal' })} />;
  }
  if (vista.tipo === 'form-pedido') {
    return <PedidoPropioFormulario pedido={vista.pedido} onVolver={() => setVista({ tipo: 'principal' })} />;
  }
  if (vista.tipo === 'nuevo-albaran') return <AlbaranWizard onVolver={volverYRefrescar} />;

  const acumuladoMensual = resumenQuery.data?.financiero?.acumulado_sin_facturar.mensual;

  function pedirCerrarMes() {
    const cliente = acumuladoMensual?.clientes[0];
    if (!cliente) return;
    Alert.alert(
      'Cerrar mes y facturar',
      `Se marcarán como facturados los ${acumuladoMensual.albaranes} albarán(es) acumulados de ${cliente}. No se puede deshacer desde la app. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar mes',
          style: 'destructive',
          onPress: async () => {
            setCerrandoMes(true);
            try {
              await cerrarMes(cliente);
              await queryClient.invalidateQueries({ queryKey: ['resumen'] });
            } catch (err) {
              Alert.alert('Error', mensajeError(err));
            } finally {
              setCerrandoMes(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.filaTitulo}>
            <ThemedText type="title" style={styles.titulo}>
              Pedidos
            </ThemedText>
            <Pressable onPress={() => setVista({ tipo: 'clientes' })}>
              <ThemedText type="link" style={{ color: theme.accent }}>
                👤 Clientes
              </ThemedText>
            </Pressable>
          </View>

          <Segmented opciones={['Profesionales', 'Particulares']} activo={sub} onCambiar={(v) => setSub(v as Sub)} />

          {sub === 'Profesionales' ? (
            <>
              <View style={styles.botonAlbaran}>
                <BotonPrimario texto="＋ Generar albarán" onPress={() => setVista({ tipo: 'nuevo-albaran' })} />
              </View>

              <SectionLabel>Clientes profesionales</SectionLabel>
              {profesionalesQuery.isLoading && <ActivityIndicator color={theme.accent} />}
              {profesionalesQuery.error && (
                <ThemedText type="small" themeColor="danger">
                  {mensajeError(profesionalesQuery.error)}
                </ThemedText>
              )}
              {profesionalesQuery.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">
                  ℹ️ {profesionalesQuery.data.aviso}
                </ThemedText>
              )}
              {!!profesionalesQuery.data?.clientes.length && (
                <ListCard>
                  {profesionalesQuery.data.clientes.map((c, i) => (
                    <ListRow
                      key={c.nombre}
                      last={i === profesionalesQuery.data!.clientes.length - 1}
                      onPress={() => setVista({ tipo: 'cliente-profesional', nombre: c.nombre })}
                      left={<Pill color={c.tipo_facturacion === 'mensual' ? 'info' : 'warning'}>{c.tipo_facturacion === 'mensual' ? 'Mensual' : 'Directa'}</Pill>}
                      title={c.nombre}
                      subtitle={c.albaranes_abiertos === 0 ? 'Sin albaranes abiertos' : `${c.albaranes_abiertos} albarán(es) abierto(s)`}
                    />
                  ))}
                </ListCard>
              )}

              <Pressable onPress={() => setVista({ tipo: 'documentos' })} style={styles.enlaceDocumentos}>
                <ThemedText type="link" style={{ color: theme.accent }}>
                  📄 Todos los documentos ›
                </ThemedText>
              </Pressable>

              {acumuladoMensual && acumuladoMensual.albaranes > 0 && (
                <>
                  <SectionLabel>Grand Folies · resumen del mes</SectionLabel>
                  {acumuladoItemizadoQuery.data?.grupos.map((g) => (
                    <ListCard key={g.cliente} style={styles.tarjetaGrupo}>
                      {g.albaranes.map((a, i) => (
                        <ListRow
                          key={a.numero}
                          last={i === g.albaranes.length - 1}
                          onPress={() => setVista({ tipo: 'documento', numero: a.numero })}
                          title={a.numero}
                          subtitle={`${g.cliente} · ${fecha.format(new Date(a.creado_en))}`}
                          right={<ThemedText type="smallBold">{eur.format(a.total)}</ThemedText>}
                        />
                      ))}
                    </ListCard>
                  ))}
                  <ListCard>
                    <ListRow
                      last
                      title="Total acumulado sin facturar"
                      subtitle={`${acumuladoMensual.albaranes} albarán(es)`}
                      right={<ThemedText type="smallBold">{eur.format(acumuladoMensual.total_eur)}</ThemedText>}
                    />
                  </ListCard>
                  <View style={styles.botonCerrarMes}>
                    {cerrandoMes ? <ActivityIndicator color={theme.accent} /> : <BotonPrimario texto="Cerrar mes y facturar" onPress={pedirCerrarMes} />}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <SectionLabel>Confirmados (web)</SectionLabel>
              {webQuery.isLoading && <ActivityIndicator color={theme.accent} />}
              {webQuery.error && (
                <ThemedText type="small" themeColor="danger">
                  {mensajeError(webQuery.error)}
                </ThemedText>
              )}
              {webQuery.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">
                  ℹ️ {webQuery.data.aviso}
                </ThemedText>
              )}
              {webQuery.data?.conectado && webQuery.data.pedidos.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No hay pedidos confirmados todavía.
                </ThemedText>
              )}
              {!!webQuery.data?.pedidos.length && (
                <ListCard>
                  {webQuery.data.pedidos.map((p, i) => (
                    <PedidoWebRow key={p.id} pedido={p} last={i === webQuery.data!.pedidos.length - 1} />
                  ))}
                </ListCard>
              )}

              <View style={styles.filaTitulo}>
                <SectionLabel>Mis pedidos</SectionLabel>
                <Pressable onPress={() => setVista({ tipo: 'form-pedido', pedido: null })}>
                  <ThemedText type="link" style={{ color: theme.accent }}>
                    ＋ Nuevo
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
                Pedidos creados a mano en NINUMAPP -- no aparecen en la web pública, es un registro propio.
              </ThemedText>
              {propiosQuery.isLoading && <ActivityIndicator color={theme.accent} />}
              {propiosQuery.error && (
                <ThemedText type="small" themeColor="danger">
                  {mensajeError(propiosQuery.error)}
                </ThemedText>
              )}
              {propiosQuery.data?.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Todavía no has creado ningún pedido propio.
                </ThemedText>
              )}
              {!!propiosQuery.data?.length && (
                <ListCard>
                  {propiosQuery.data.map((p, i) => (
                    <PedidoPropioRow
                      key={p.id}
                      pedido={p}
                      last={i === propiosQuery.data!.length - 1}
                      onPress={() => setVista({ tipo: 'form-pedido', pedido: p })}
                    />
                  ))}
                </ListCard>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PedidoWebRow({ pedido, last }: { pedido: Pedido; last: boolean }) {
  const etiqueta = ETIQUETAS_KIND[pedido.kind] ?? { texto: pedido.kind, color: 'accent' as PillColor };
  return (
    <ListRow
      last={last}
      left={<Pill color={etiqueta.color}>{etiqueta.texto}</Pill>}
      title={pedido.cliente}
      subtitle={[pedido.status, pedido.locator, pedido.descripcion].filter(Boolean).join(' · ')}
      right={
        <View style={styles.right}>
          <ThemedText type="smallBold">{eur.format(pedido.total_cents / 100)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {fecha.format(new Date(pedido.recogida_fecha ?? pedido.creado_en))}
          </ThemedText>
        </View>
      }
    />
  );
}

function PedidoPropioRow({ pedido, last, onPress }: { pedido: PedidoPropio; last: boolean; onPress: () => void }) {
  const etiqueta = ETIQUETAS_ESTADO_PROPIO[pedido.estado] ?? { texto: pedido.estado, color: 'accent' as PillColor };
  return (
    <ListRow
      last={last}
      onPress={onPress}
      left={<Pill color={etiqueta.color}>{etiqueta.texto}</Pill>}
      title={pedido.cliente_nombre}
      subtitle={pedido.descripcion}
      right={
        <View style={styles.right}>
          <ThemedText type="smallBold">{eur.format(pedido.total_cents / 100)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {fecha.format(new Date(pedido.creado_en))}
          </ThemedText>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 26, lineHeight: 31 },
  nota: { marginTop: Spacing.two, marginBottom: Spacing.two, lineHeight: 18 },
  right: { alignItems: 'flex-end' },
  botonAlbaran: { marginTop: Spacing.three, marginBottom: Spacing.two },
  enlaceDocumentos: { marginTop: Spacing.three },
  tarjetaGrupo: { marginBottom: Spacing.two },
  botonCerrarMes: { marginTop: Spacing.two },
});
