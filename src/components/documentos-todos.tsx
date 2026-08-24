import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentoDetalle } from '@/components/documento-detalle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import { mensajeError, obtenerTodosLosDocumentos } from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Réplica de /panel/pedidos/documentos -- historial completo, del más reciente al
// más antiguo (a diferencia de "Documentos recientes" en Inicio, que solo son 6).
export function DocumentosTodos({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [indiceAbierto, setIndiceAbierto] = useState<number | null>(null);
  useVolverAtras(indiceAbierto === null, () => setIndiceAbierto(null));
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['documentos-todos'], queryFn: obtenerTodosLosDocumentos });

  if (indiceAbierto !== null && data?.documentos.length) {
    return (
      <DocumentoDetalle
        numero={data.documentos[indiceAbierto].numero}
        etiquetaVolver="Todos los documentos"
        onVolver={() => setIndiceAbierto(null)}
        onAnterior={indiceAbierto > 0 ? () => setIndiceAbierto(indiceAbierto - 1) : undefined}
        onSiguiente={indiceAbierto < data.documentos.length - 1 ? () => setIndiceAbierto(indiceAbierto + 1) : undefined}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Inicio
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Todos los documentos
          </ThemedText>
          {!!data?.documentos.length && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
              {data.documentos.length} en total, del más reciente al más antiguo
            </ThemedText>
          )}

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {mensajeError(error)}
            </ThemedText>
          )}
          {data?.conectado && data.documentos.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Todavía no hay albaranes generados.
            </ThemedText>
          )}

          {!!data?.documentos.length && (
            <ListCard>
              {data.documentos.map((d, i) => (
                <ListRow
                  key={d.numero}
                  last={i === data.documentos.length - 1}
                  onPress={() => setIndiceAbierto(i)}
                  title={d.numero}
                  subtitle={`${d.cliente} · ${d.estado}`}
                  right={
                    <View style={styles.derecha}>
                      <ThemedText type="smallBold">{d.total != null ? eur.format(d.total) : '—'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {fecha.format(new Date(d.creado_en))}
                      </ThemedText>
                    </View>
                  }
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
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  sub: { marginBottom: Spacing.two },
  centro: { marginTop: Spacing.five },
  derecha: { alignItems: 'flex-end', gap: 2 },
});
