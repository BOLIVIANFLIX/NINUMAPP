import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentoDetalle } from '@/components/documento-detalle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import { cerrarCobroMensual, marcarCobrado, mensajeError, obtenerFacturasPendientesCobro } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

// Réplica de /panel/pedidos/facturas-pendientes-cobro -- clientes de facturación
// mensual agrupados (con "Marcar cobrado" de grupo) + directas individuales.
export function FacturasPendientesCobro({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState<{ numeros: string[]; indice: number } | null>(null);
  useVolverAtras(abierto === null, () => setAbierto(null));
  const [cobrando, setCobrando] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['facturas-pendientes-cobro'], queryFn: obtenerFacturasPendientesCobro });

  if (abierto) {
    return (
      <DocumentoDetalle
        numero={abierto.numeros[abierto.indice]}
        etiquetaVolver="Facturas pendientes"
        onVolver={() => setAbierto(null)}
        onAnterior={abierto.indice > 0 ? () => setAbierto({ ...abierto, indice: abierto.indice - 1 }) : undefined}
        onSiguiente={abierto.indice < abierto.numeros.length - 1 ? () => setAbierto({ ...abierto, indice: abierto.indice + 1 }) : undefined}
      />
    );
  }

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['facturas-pendientes-cobro'] });
    queryClient.invalidateQueries({ queryKey: ['resumen'] });
  }

  async function marcarGrupoCobrado(cliente: string) {
    setCobrando(cliente);
    try {
      await cerrarCobroMensual(cliente);
      invalidar();
    } catch (err) {
      Alert.alert('Error', mensajeError(err));
    } finally {
      setCobrando(null);
    }
  }

  async function marcarUnoCobrado(numero: string) {
    setCobrando(numero);
    try {
      await marcarCobrado(numero);
      invalidar();
    } catch (err) {
      Alert.alert('Error', mensajeError(err));
    } finally {
      setCobrando(null);
    }
  }

  const vacio = !!data?.conectado && data.mensuales.length === 0 && data.directas.length === 0;

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
            Facturas pendientes de cobro
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {mensajeError(error)}
            </ThemedText>
          )}
          {data?.aviso && (
            <ThemedText type="small" themeColor="textSecondary">
              ℹ️ {data.aviso}
            </ThemedText>
          )}
          {vacio && (
            <ThemedText type="small" themeColor="textSecondary">
              No hay facturas pendientes de cobro ahora mismo.
            </ThemedText>
          )}

          {data?.mensuales.map((g) => (
            <View key={g.cliente} style={styles.grupo}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                {g.cliente.toUpperCase()} · FACTURADO, PENDIENTE DE COBRO
              </ThemedText>
              <ListCard>
                {g.albaranes.map((a, i) => (
                  <ListRow
                    key={a.numero}
                    last={i === g.albaranes.length - 1}
                    onPress={() => setAbierto({ numeros: g.albaranes.map((x) => x.numero), indice: i })}
                    title={a.numero}
                    subtitle={fecha.format(new Date(a.creado_en))}
                    right={<ThemedText type="small" themeColor="textSecondary">{eur.format(a.total)}</ThemedText>}
                  />
                ))}
              </ListCard>
              <View style={styles.filaTotal}>
                <ThemedText type="small" themeColor="textSecondary">Total facturado</ThemedText>
                <ThemedText type="smallBold">{eur.format(g.total)}</ThemedText>
              </View>
              <Pressable
                onPress={() => marcarGrupoCobrado(g.cliente)}
                disabled={cobrando === g.cliente}
                style={[styles.botonCobrar, { backgroundColor: theme.success, opacity: cobrando === g.cliente ? 0.6 : 1 }]}>
                {cobrando === g.cliente ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Marcar cobrado</ThemedText>}
              </Pressable>
            </View>
          ))}

          {!!data?.directas.length && (
            <View style={styles.grupo}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                FACTURADO, PENDIENTE DE COBRO
              </ThemedText>
              <ListCard>
                {data.directas.map((a, i) => (
                  <ListRow
                    key={a.numero}
                    last={i === data.directas.length - 1}
                    onPress={() => setAbierto({ numeros: data!.directas.map((x) => x.numero), indice: i })}
                    title={`${a.cliente} · ${a.numero}`}
                    subtitle={fecha.format(new Date(a.creado_en))}
                    right={
                      <Pressable
                        onPress={() => marcarUnoCobrado(a.numero)}
                        disabled={cobrando === a.numero}
                        style={[styles.botonChico, { backgroundColor: theme.success, opacity: cobrando === a.numero ? 0.6 : 1 }]}>
                        {cobrando === a.numero ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="small" style={{ color: '#fff', fontWeight: '700' }}>Marcar cobrado</ThemedText>}
                      </Pressable>
                    }
                  />
                ))}
              </ListCard>
            </View>
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
  centro: { marginTop: Spacing.five },
  grupo: { marginTop: Spacing.two },
  seccion: { marginBottom: Spacing.two, letterSpacing: 0.3 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.one, marginTop: Spacing.two, marginBottom: Spacing.two },
  botonCobrar: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  botonChico: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});
