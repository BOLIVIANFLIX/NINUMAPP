import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  actualizarPedidoPropio,
  crearPedidoPropio,
  mensajeError,
  obtenerClientes,
  type EstadoPedidoPropio,
  type PedidoPropio,
} from '@/lib/api';

const ESTADOS: EstadoPedidoPropio[] = ['pendiente', 'confirmado', 'entregado', 'cobrado'];
const ETIQUETAS_ESTADO: Record<EstadoPedidoPropio, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  cobrado: 'Cobrado',
};

// No es una ruta -- ver obrador.tsx. Vista dentro de la propia pestaña Pedidos.
export function PedidoPropioFormulario({ pedido, onVolver }: { pedido: PedidoPropio | null; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: obtenerClientes });

  const [clienteId, setClienteId] = useState(pedido?.cliente_id ?? '');
  const [descripcion, setDescripcion] = useState(pedido?.descripcion ?? '');
  const [total, setTotal] = useState(pedido ? (pedido.total_cents / 100).toString() : '');
  const [estado, setEstado] = useState<EstadoPedidoPropio>(pedido?.estado ?? 'pendiente');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!clienteId) {
      setError('Elige un cliente.');
      return;
    }
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }
    setGuardando(true);
    setError(null);
    const body = {
      cliente_id: clienteId,
      descripcion,
      total_cents: Math.round((Number(total.replace(',', '.')) || 0) * 100),
      estado,
    };
    try {
      if (pedido) await actualizarPedidoPropio(pedido.id, body);
      else await crearPedidoPropio(body);
      await queryClient.invalidateQueries({ queryKey: ['pedidos-propios'] });
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.formulario}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Pedidos
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={{ fontSize: 26, lineHeight: 31 }}>
            {pedido ? 'Editar pedido' : 'Nuevo pedido'}
          </ThemedText>

          <ThemedView style={styles.campo}>
            <ThemedText type="small" themeColor="textSecondary">
              Cliente *
            </ThemedText>
            {clientes.isLoading && <ActivityIndicator color={theme.accent} />}
            {clientes.data?.length === 0 && (
              <ThemedText type="small" themeColor="danger">
                No hay clientes todavía -- crea uno primero desde "Clientes".
              </ThemedText>
            )}
            <ThemedView style={styles.chips}>
              {clientes.data?.map((c) => (
                <Pressable key={c.id} onPress={() => setClienteId(c.id)}>
                  <ThemedView
                    style={[
                      styles.chip,
                      { borderColor: theme.accent, backgroundColor: clienteId === c.id ? theme.accent : 'transparent' },
                    ]}>
                    <ThemedText type="small" style={clienteId === c.id ? styles.chipTextoSeleccionado : undefined}>
                      {c.nombre}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.campo}>
            <ThemedText type="small" themeColor="textSecondary">
              Descripción *
            </ThemedText>
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              style={[styles.input, styles.inputMultilinea, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </ThemedView>

          <ThemedView style={styles.campo}>
            <ThemedText type="small" themeColor="textSecondary">
              Importe (€)
            </ThemedText>
            <TextInput
              value={total}
              onChangeText={setTotal}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </ThemedView>

          <ThemedView style={styles.campo}>
            <ThemedText type="small" themeColor="textSecondary">
              Estado
            </ThemedText>
            <ThemedView style={styles.chips}>
              {ESTADOS.map((e) => (
                <Pressable key={e} onPress={() => setEstado(e)}>
                  <ThemedView
                    style={[styles.chip, { borderColor: theme.accent, backgroundColor: estado === e ? theme.accent : 'transparent' }]}>
                    <ThemedText type="small" style={estado === e ? styles.chipTextoSeleccionado : undefined}>
                      {ETIQUETAS_ESTADO[e]}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </ThemedView>
          </ThemedView>

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}

          <BotonPrimario texto="Guardar" onPress={guardar} cargando={guardando} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  formulario: { padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  campo: { gap: Spacing.two },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  inputMultilinea: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: Spacing.five, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  chipTextoSeleccionado: { color: '#fff' },
});
