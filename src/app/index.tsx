import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerResumen } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function InicioScreen() {
  const theme = useTheme();
  const { cerrarSesion } = useAuth();

  const { data: resumen, error, isFetching, refetch } = useQuery({
    queryKey: ['resumen'],
    queryFn: obtenerResumen,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={theme.accent} />}>
          <ThemedView style={styles.cabecera}>
            <ThemedText type="subtitle" style={{ color: theme.accent }}>
              Inicio
            </ThemedText>
            <Pressable onPress={cerrarSesion}>
              <ThemedText type="link" themeColor="textSecondary">
                Cerrar sesión
              </ThemedText>
            </Pressable>
          </ThemedView>

          {resumen && (
            <ThemedText type="small" themeColor="textSecondary">
              Hola, {resumen.usuario}
            </ThemedText>
          )}

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {mensajeError(error)}
            </ThemedText>
          )}

          {resumen && (
            <ThemedView type="backgroundElement" style={styles.tarjetas}>
              <Tarjeta titulo="Ingresos sin IVA (mes)" valor={eur.format(resumen.ingresos_sin_iva_mes)} />
              <Tarjeta titulo="Facturas pendientes de cobro" valor={String(resumen.facturas_pendientes_cobro)} />
              <Tarjeta titulo="Contactos sin resolver" valor={String(resumen.contactos_sin_resolver)} />
            </ThemedView>
          )}

          {resumen?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {resumen.aviso}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <ThemedView style={styles.tarjeta}>
      <ThemedText type="small" themeColor="textSecondary">
        {titulo}
      </ThemedText>
      <ThemedText type="subtitle">{valor}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tarjetas: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  tarjeta: { gap: Spacing.one },
  aviso: { lineHeight: 20 },
});
