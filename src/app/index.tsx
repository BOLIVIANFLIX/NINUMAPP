import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalisisFinanciero } from '@/components/analisis-financiero';
import { IngresosGastos } from '@/components/ingresos-gastos';
import { PreciosTienda } from '@/components/precios-tienda';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KpiCard, KpiRow, ListCard, ListRow, Pill, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerDocumentosRecientes, obtenerResumen } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaHoy = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });

const ACCESOS = [
  { destino: '/pedidos' as const, icono: '🛒', texto: 'Pedidos' },
  { destino: '/obrador' as const, icono: '🔥', texto: 'Obrador' },
  { destino: '/avisos' as const, icono: '🔔', texto: 'Avisos' },
];

type Vista = 'inicio' | 'analisis' | 'ingresos' | 'precios-tienda';

export default function InicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { cerrarSesion } = useAuth();
  const [vista, setVista] = useState<Vista>('inicio');

  const { data: resumen, error, isFetching, refetch } = useQuery({
    queryKey: ['resumen'],
    queryFn: obtenerResumen,
  });
  const documentos = useQuery({ queryKey: ['documentos-recientes'], queryFn: obtenerDocumentosRecientes });

  const hoy = fechaHoy.format(new Date());
  const f = resumen?.financiero;

  if (vista === 'analisis') return <AnalisisFinanciero onVolver={() => setVista('inicio')} />;
  if (vista === 'ingresos') return <IngresosGastos onVolver={() => setVista('inicio')} />;
  if (vista === 'precios-tienda') return <PreciosTienda onVolver={() => setVista('inicio')} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={theme.accent} />}>
          <View style={styles.cabecera}>
            <View>
              <ThemedText type="title" style={styles.saludo}>
                Hola, {resumen?.usuario ?? '...'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subFecha}>
                {hoy.charAt(0).toUpperCase() + hoy.slice(1)}
              </ThemedText>
            </View>
            <Pressable onPress={cerrarSesion}>
              <ThemedText type="link" themeColor="textSecondary">
                Cerrar sesión
              </ThemedText>
            </Pressable>
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {mensajeError(error)}
            </ThemedText>
          )}

          {f && (
            <KpiRow>
              <KpiCard label="Ingresos sin IVA · mes" value={eur.format(f.ingresos_sin_iva_cobrados_mes)} wide />
              <KpiCard label="Facturas por cobrar" value={eur.format(f.facturas_pendientes_cobro.total_eur)} />
              <KpiCard label="Solicitudes sin revisar" value={String(resumen?.solicitudes_pendientes ?? 0)} />
            </KpiRow>
          )}

          {resumen?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {resumen.aviso}
            </ThemedText>
          )}

          {f && (f.acumulado_sin_facturar.mensual.albaranes > 0 || f.acumulado_sin_facturar.directa.listas_para_emitir > 0) && (
            <ListCard>
              {f.acumulado_sin_facturar.mensual.albaranes > 0 && (
                <ListRow
                  last={f.acumulado_sin_facturar.directa.listas_para_emitir === 0}
                  left={<Pill color="info">Mensual</Pill>}
                  title="Acumulado sin facturar (con IVA)"
                  subtitle={`${f.acumulado_sin_facturar.mensual.clientes.join(', ')} · ${f.acumulado_sin_facturar.mensual.albaranes} albarán(es)`}
                  right={<ThemedText type="smallBold">{eur.format(f.acumulado_sin_facturar.mensual.total_eur)}</ThemedText>}
                />
              )}
              {f.acumulado_sin_facturar.directa.listas_para_emitir > 0 && (
                <ListRow
                  last
                  left={<Pill color="warning">Directa</Pill>}
                  title="Facturas directas pendientes"
                  subtitle={`${f.acumulado_sin_facturar.directa.listas_para_emitir} lista(s) para emitir`}
                  right={<ThemedText type="smallBold">{eur.format(f.acumulado_sin_facturar.directa.total_eur)}</ThemedText>}
                />
              )}
            </ListCard>
          )}

          <SectionLabel>Accesos rápidos</SectionLabel>
          <View style={styles.quickRow}>
            {ACCESOS.map((a) => (
              <Pressable key={a.destino} onPress={() => router.push(a.destino)} style={[styles.quick, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.quickIco, { backgroundColor: theme.accentSoft }]}>
                  <ThemedText style={{ fontSize: 17 }}>{a.icono}</ThemedText>
                </View>
                <ThemedText type="small" style={styles.quickTxt}>
                  {a.texto}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {f && (
            <Pressable onPress={() => setVista('ingresos')}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.gastos}>
                💸 Gastos del mes: {eur.format(f.gastos_mes)}
              </ThemedText>
            </Pressable>
          )}

          <SectionLabel>Gestión</SectionLabel>
          <ListCard>
            <ListRow onPress={() => setVista('analisis')} title="📊 Análisis financiero" subtitle="Resumen, productos, recetas, precios" />
            <ListRow onPress={() => setVista('ingresos')} title="💰 Ingresos y gastos" subtitle="Histórico mes a mes" />
            <ListRow last onPress={() => setVista('precios-tienda')} title="🏷️ Precios de la tienda" subtitle="Precio público, se refleja en la web" />
          </ListCard>

          {!!documentos.data?.documentos.length && (
            <>
              <SectionLabel>Documentos recientes</SectionLabel>
              <ListCard>
                {documentos.data.documentos.map((d, i) => (
                  <ListRow
                    key={d.numero}
                    last={i === documentos.data!.documentos.length - 1}
                    title={`Albarán ${d.numero}`}
                    subtitle={d.cliente}
                    right={
                      <ThemedText type="small" themeColor="textSecondary">
                        {fechaCorta.format(new Date(d.creado_en))}
                      </ThemedText>
                    }
                  />
                ))}
              </ListCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.four },
  saludo: { fontSize: 26, lineHeight: 31 },
  subFecha: { marginTop: 2, textTransform: 'capitalize' },
  aviso: { lineHeight: 20, marginBottom: Spacing.three },
  quickRow: { flexDirection: 'row', gap: Spacing.two },
  quick: { flex: 1, borderRadius: 16, paddingVertical: Spacing.three, paddingHorizontal: Spacing.one, alignItems: 'center' },
  quickIco: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  quickTxt: { fontWeight: '600' },
  gastos: { marginTop: Spacing.three },
});
