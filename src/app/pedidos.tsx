import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerPedidos, type Pedido } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });

const ETIQUETAS_KIND: Record<string, string> = { b2b: 'B2B', encargo: 'Particular' };

export default function PedidosScreen() {
  const theme = useTheme();

  const { data, error, isLoading } = useQuery({
    queryKey: ['pedidos'],
    queryFn: obtenerPedidos,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={[styles.cabecera, { color: theme.accent }]}>
          Pedidos
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

        {data?.conectado && data.pedidos.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            No hay pedidos confirmados todavía.
          </ThemedText>
        )}

        {data && data.pedidos.length > 0 && (
          <FlatList
            data={data.pedidos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => <TarjetaPedido pedido={item} />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function TarjetaPedido({ pedido }: { pedido: Pedido }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">{pedido.cliente}</ThemedText>
        <ThemedText type="default">{eur.format(pedido.total_cents / 100)}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="small" themeColor="textSecondary">
          {ETIQUETAS_KIND[pedido.kind] ?? pedido.kind} · {pedido.status}
          {pedido.locator ? ` · ${pedido.locator}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fecha.format(new Date(pedido.recogida_fecha ?? pedido.creado_en))}
        </ThemedText>
      </ThemedView>
      {pedido.descripcion && (
        <ThemedText type="small" themeColor="textSecondary">
          {pedido.descripcion}
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
