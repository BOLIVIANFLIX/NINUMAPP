import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerAlarmas, obtenerRecetas } from '@/lib/api';

const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ObradorScreen() {
  const theme = useTheme();

  const alarmas = useQuery({ queryKey: ['obrador', 'alarmas'], queryFn: obtenerAlarmas });
  const recetas = useQuery({ queryKey: ['obrador', 'recetas'], queryFn: obtenerRecetas });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="subtitle" style={{ color: theme.accent }}>
            Obrador
          </ThemedText>

          <Seccion titulo="Alarmas de neveras">
            {alarmas.isLoading && <ActivityIndicator color={theme.accent} />}
            {alarmas.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(alarmas.error)}
              </ThemedText>
            )}
            {alarmas.data?.aviso && (
              <ThemedText type="small" themeColor="textSecondary">
                ℹ️ {alarmas.data.aviso}
              </ThemedText>
            )}
            {alarmas.data?.conectado && alarmas.data.alarmas.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Sin alarmas activas.
              </ThemedText>
            )}
            {alarmas.data?.alarmas.map((a) => (
              <ThemedView key={a.entity_id} type="backgroundElement" style={styles.fila}>
                <ThemedText type="default">🔔 {a.nombre}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {a.ultima_vez ? `Última vez: ${fechaHora.format(new Date(a.ultima_vez))}` : 'Sin activaciones registradas'}
                </ThemedText>
              </ThemedView>
            ))}
          </Seccion>

          <Seccion titulo="Recetas">
            {recetas.isLoading && <ActivityIndicator color={theme.accent} />}
            {recetas.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(recetas.error)}
              </ThemedText>
            )}
            {recetas.data?.aviso && (
              <ThemedText type="small" themeColor="textSecondary">
                ℹ️ {recetas.data.aviso}
              </ThemedText>
            )}
            {recetas.data?.conectado && recetas.data.recetas.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Grocy no tiene recetas todavía.
              </ThemedText>
            )}
            {recetas.data?.recetas.map((r) => (
              <ThemedView key={r.id} type="backgroundElement" style={styles.fila}>
                <ThemedText type="default">🥐 {r.nombre}</ThemedText>
                {r.descripcion && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {r.descripcion}
                  </ThemedText>
                )}
              </ThemedView>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              ℹ️ Coste real por hora: próximamente.
            </ThemedText>
          </Seccion>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.seccion}>
      <ThemedText type="default" style={styles.tituloSeccion}>
        {titulo}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  seccion: { gap: Spacing.two },
  tituloSeccion: { fontWeight: '600' },
  fila: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
});
