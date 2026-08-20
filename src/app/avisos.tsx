import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerAvisos, type SolicitudPendiente } from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AvisosScreen() {
  const theme = useTheme();

  const { data, error, isLoading } = useQuery({
    queryKey: ['avisos'],
    queryFn: obtenerAvisos,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={[styles.cabecera, { color: theme.accent }]}>
          Avisos
        </ThemedText>

        {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.aviso}>
            {mensajeError(error)}
          </ThemedText>
        )}

        {data?.aviso && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            ℹ️ {data.aviso}
          </ThemedText>
        )}

        {data?.conectado && data.solicitudes.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            No hay solicitudes pendientes de revisar.
          </ThemedText>
        )}

        {data && data.solicitudes.length > 0 && (
          <FlatList
            data={data.solicitudes}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => <TarjetaSolicitud solicitud={item} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function TarjetaSolicitud({ solicitud }: { solicitud: SolicitudPendiente }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">🔔 {solicitud.cliente}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fecha.format(new Date(solicitud.creado_en))}
        </ThemedText>
      </ThemedView>
      {solicitud.descripcion && (
        <ThemedText type="small" themeColor="textSecondary">
          {solicitud.descripcion}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  cabecera: { padding: Spacing.four, paddingBottom: Spacing.two },
  aviso: { lineHeight: 20, paddingHorizontal: Spacing.four },
  centro: { marginTop: Spacing.five },
  lista: { padding: Spacing.four, gap: Spacing.three },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  filaSuperior: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
