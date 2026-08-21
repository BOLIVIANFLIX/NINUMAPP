import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Clientes } from '@/components/clientes';
import { PedidoPropioFormulario } from '@/components/pedido-propio-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, Pill, SectionLabel, Segmented, type PillColor } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  mensajeError,
  obtenerClientesProfesionales,
  obtenerPedidos,
  obtenerPedidosPropios,
  obtenerResumen,
  type Pedido,
  type PedidoPropio,
} from '@/lib/api';

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

type Vista = { tipo: 'principal' } | { tipo: 'clientes' } | { tipo: 'form-pedido'; pedido: PedidoPropio | null };
type Sub = 'Profesionales' | 'Particulares';

export default function PedidosScreen() {
  const theme = useTheme();
  const [vista, setVista] = useState<Vista>({ tipo: 'principal' });
  const [sub, setSub] = useState<Sub>('Profesionales');

  const profesionalesQuery = useQuery({ queryKey: ['clientes-profesionales'], queryFn: obtenerClientesProfesionales });
  const resumenQuery = useQuery({ queryKey: ['resumen'], queryFn: obtenerResumen });
  const webQuery = useQuery({ queryKey: ['pedidos'], queryFn: obtenerPedidos });
  const propiosQuery = useQuery({ queryKey: ['pedidos-propios'], queryFn: obtenerPedidosPropios });

  if (vista.tipo === 'clientes') return <Clientes onVolver={() => setVista({ tipo: 'principal' })} />;
  if (vista.tipo === 'form-pedido') {
    return <PedidoPropioFormulario pedido={vista.pedido} onVolver={() => setVista({ tipo: 'principal' })} />;
  }

  const acumuladoMensual = resumenQuery.data?.financiero?.acumulado_sin_facturar.mensual;

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
                      left={<Pill color={c.tipo_facturacion === 'mensual' ? 'info' : 'warning'}>{c.tipo_facturacion === 'mensual' ? 'Mensual' : 'Directa'}</Pill>}
                      title={c.nombre}
                      subtitle={c.albaranes_abiertos === 0 ? 'Sin albaranes abiertos' : `${c.albaranes_abiertos} albarán(es) abierto(s)`}
                    />
                  ))}
                </ListCard>
              )}

              {acumuladoMensual && acumuladoMensual.albaranes > 0 && (
                <>
                  <SectionLabel>Grand Folies · resumen del mes</SectionLabel>
                  <ListCard>
                    <ListRow
                      last
                      title="Total acumulado sin facturar"
                      subtitle={`${acumuladoMensual.albaranes} albarán(es)`}
                      right={<ThemedText type="smallBold">{eur.format(acumuladoMensual.total_eur)}</ThemedText>}
                    />
                  </ListCard>
                </>
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
                ℹ️ Solo consulta -- generar albarán y cerrar mes/facturar se siguen haciendo desde el panel.
              </ThemedText>
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
});
