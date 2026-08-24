import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  guardarPreferenciaNotificacion,
  mensajeError,
  obtenerPreferenciasNotificaciones,
  type PreferenciaNotificacion,
} from '@/lib/api';

/** Qué avisos quiere Ariadna que le lleguen como push -- pedido explícito 2026-08-23:
 * en vez de decidir nosotros uno por uno cuáles migrar de Telegram, un menú donde
 * ella misma marca/desmarca cada tipo. Ver backend/app/routers/notificaciones.py
 * (_DEFAULTS) para el catálogo completo y qué nace activado. */
export function PreferenciasAvisos({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['preferencias-avisos'], queryFn: obtenerPreferenciasNotificaciones });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Inicio</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>Avisos por notificación</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Marca qué avisos quieres recibir en el móvil. Los que desmarques siguen llegando por Telegram como hasta ahora.
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}

          {data && (
            <ListCard>
              {data.map((pref, i) => (
                <FilaPreferencia key={pref.tipo} preferencia={pref} last={i === data.length - 1} onCambiado={() => queryClient.invalidateQueries({ queryKey: ['preferencias-avisos'] })} />
              ))}
            </ListCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FilaPreferencia({
  preferencia,
  last,
  onCambiado,
}: {
  preferencia: PreferenciaNotificacion;
  last: boolean;
  onCambiado: () => void;
}) {
  const [guardando, setGuardando] = useState(false);

  async function alCambiar(nuevoValor: boolean) {
    setGuardando(true);
    try {
      await guardarPreferenciaNotificacion(preferencia.tipo, nuevoValor);
      onCambiado();
    } catch (err) {
      Alert.alert('Error', 'No se ha podido guardar -- inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ListRow
      last={last}
      title={preferencia.etiqueta}
      right={guardando ? <ActivityIndicator size="small" /> : <Switch value={preferencia.activo} onValueChange={alCambiar} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  nota: { lineHeight: 18, marginBottom: Spacing.one },
  centro: { marginTop: Spacing.five },
});
