import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KpiCard, KpiRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerResumen } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaHoy = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

const ACCESOS = [
  { destino: '/pedidos' as const, icono: '🛒', texto: 'Pedidos' },
  { destino: '/obrador' as const, icono: '🔥', texto: 'Obrador' },
  { destino: '/avisos' as const, icono: '🔔', texto: 'Avisos' },
];

export default function InicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { cerrarSesion } = useAuth();

  const { data: resumen, error, isFetching, refetch } = useQuery({
    queryKey: ['resumen'],
    queryFn: obtenerResumen,
  });

  const hoy = fechaHoy.format(new Date());

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

          {resumen && (
            <KpiRow>
              <KpiCard label="Ingresos · mes" value={eur.format(resumen.ingresos_con_iva_mes)} wide />
              <KpiCard label="Pedidos confirmados" value={String(resumen.pedidos_confirmados_mes)} />
              <KpiCard label="Facturas por cobrar" value={String(resumen.facturas_pendientes_cobro)} />
              <KpiCard label="Solicitudes sin revisar" value={String(resumen.solicitudes_pendientes)} />
            </KpiRow>
          )}

          {resumen?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {resumen.aviso}
            </ThemedText>
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
});
