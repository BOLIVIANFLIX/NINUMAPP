import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentoDetalle } from '@/components/documento-detalle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerTodosLosDocumentos } from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

// Réplica de /panel/pedidos/documentos -- historial completo, del más reciente al
// más antiguo (a diferencia de "Documentos recientes" en Inicio, que solo son 6).
export function DocumentosTodos({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [numeroAbierto, setNumeroAbierto] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['documentos-todos'], queryFn: obtenerTodosLosDocumentos });

  if (numeroAbierto) {
    return <DocumentoDetalle numero={numeroAbierto} etiquetaVolver="Todos los documentos" onVolver={() => setNumeroAbierto(null)} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
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
                  onPress={() => setNumeroAbierto(d.numero)}
                  title={d.numero}
                  subtitle={`${d.cliente} · ${d.estado}`}
                  right={
                    <ThemedText type="small" themeColor="textSecondary">
                      {fecha.format(new Date(d.creado_en))}
                    </ThemedText>
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
});
