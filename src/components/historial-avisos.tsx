import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { marcarAvisoLeido, marcarTodosAvisosLeidos, mensajeError, obtenerHistorialAvisos } from '@/lib/api';

const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Todo lo que ha llegado alguna vez por /api/notificaciones/enviar (pedido pagado,
 * encargo por email, contacto web...), quede o no constancia del push -- pedido
 * explícito de Ariadna 2026-08-24, tras un pedido pagado que no se reflejó en la app
 * porque el push nunca tuvo ningún dispositivo registrado. Ver AvisoHistorial en
 * backend/app/models.py: se guarda siempre, aunque el push falle o el tipo esté
 * desactivado en preferencias. */
export function HistorialAvisos({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['historial-avisos'], queryFn: obtenerHistorialAvisos, refetchInterval: 30_000 });

  const noLeidos = data?.filter((a) => !a.leido).length ?? 0;

  async function alTocar(id: string) {
    await marcarAvisoLeido(id);
    queryClient.invalidateQueries({ queryKey: ['historial-avisos'] });
  }

  async function marcarTodos() {
    await marcarTodosAvisosLeidos();
    queryClient.invalidateQueries({ queryKey: ['historial-avisos'] });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Inicio</ThemedText>
          </Pressable>
          <View style={styles.cabecera}>
            <ThemedText type="title" style={styles.titulo}>Historial de avisos</ThemedText>
            {noLeidos > 0 && (
              <Pressable onPress={marcarTodos}>
                <ThemedText type="link" style={{ color: theme.accent }}>Marcar todos como leídos</ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Todo lo que ha llegado como notificación, aunque no te haya avisado el móvil.
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}
          {data && data.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">Todavía no ha llegado ningún aviso.</ThemedText>
          )}

          {!!data?.length && (
            <ListCard>
              {data.map((aviso, i) => (
                <ListRow
                  key={aviso.id}
                  last={i === data.length - 1}
                  onPress={aviso.leido ? undefined : () => alTocar(aviso.id)}
                  left={!aviso.leido ? <View style={[styles.puntoNoLeido, { backgroundColor: theme.accent }]} /> : <View style={styles.puntoHueco} />}
                  title={aviso.titulo}
                  subtitle={`${aviso.cuerpo}\n${fechaHora.format(new Date(aviso.creado_en))}`}
                />
              ))}
            </ListCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  titulo: { fontSize: 26, lineHeight: 31 },
  nota: { lineHeight: 18, marginBottom: Spacing.one },
  centro: { marginTop: Spacing.five },
  puntoNoLeido: { width: 9, height: 9, borderRadius: 5, marginTop: 6, marginRight: Spacing.two },
  puntoHueco: { width: 9, height: 9, marginRight: Spacing.two },
});
