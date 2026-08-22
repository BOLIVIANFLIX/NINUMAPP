import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { eliminarPrecioTienda, guardarPrecioTienda, mensajeError, obtenerPreciosTienda, type PrecioTienda } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

type Vista = { tipo: 'lista' } | { tipo: 'form'; precio: PrecioTienda | null };

// Precio público editable sin tocar el código de la web -- si hay fila aquí para
// una referencia, la web la usa en vez del precio del markdown (tanto en /tienda/
// como en el checkout de Stripe). "Referencia" es el número de la pieza en la web,
// o "slug-edicion:caja-N" para una caja de una edición especial.
export function PreciosTienda({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const { data, isLoading, error } = useQuery({ queryKey: ['precios-tienda'], queryFn: obtenerPreciosTienda });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['precios-tienda'] });
  }

  if (vista.tipo === 'form') {
    return (
      <PrecioTiendaForm
        precio={vista.precio}
        onCancelar={() => setVista({ tipo: 'lista' })}
        onGuardado={() => {
          invalidar();
          setVista({ tipo: 'lista' });
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Inicio</ThemedText>
          </Pressable>
          <View style={styles.filaTitulo}>
            <ThemedText type="title" style={styles.titulo}>Precios de la tienda</ThemedText>
            <Pressable onPress={() => setVista({ tipo: 'form', precio: null })}>
              <ThemedText type="link" style={{ color: theme.accent }}>＋ Nuevo</ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Precio público que se ve y se cobra en la web -- si no hay una fila aquí para un producto, sigue usando el precio de siempre.
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}
          {data?.aviso && <ThemedText type="small" themeColor="textSecondary">ℹ️ {data.aviso}</ThemedText>}
          {data?.conectado && data.precios.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">Todavía no hay ningún precio propio guardado.</ThemedText>
          )}

          {!!data?.precios.length && (
            <ListCard>
              {data.precios.map((p, i) => (
                <ListRow
                  key={p.referencia}
                  last={i === data.precios.length - 1}
                  onPress={() => setVista({ tipo: 'form', precio: p })}
                  title={p.referencia}
                  subtitle={`Actualizado ${fecha.format(new Date(p.actualizado_en))}`}
                  right={<ThemedText type="smallBold">{eur.format(p.precio)}</ThemedText>}
                />
              ))}
            </ListCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PrecioTiendaForm({
  precio,
  onCancelar,
  onGuardado,
}: {
  precio: PrecioTienda | null;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const theme = useTheme();
  const [referencia, setReferencia] = useState(precio?.referencia ?? '');
  const [valor, setValor] = useState(precio ? String(precio.precio) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const num = parseFloat(valor.replace(',', '.'));
    if (!referencia.trim() || Number.isNaN(num) || num <= 0) {
      setError('Falta la referencia o el precio no es válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await guardarPrecioTienda(referencia.trim(), num);
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminar() {
    if (!precio) return;
    Alert.alert('¿Quitar este precio propio?', 'La web volverá a usar el precio de siempre para este producto.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await eliminarPrecioTienda(precio.referencia);
          onGuardado();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onCancelar}>
            <ThemedText type="link" themeColor="textSecondary">← Precios de la tienda</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>{precio ? 'Editar precio' : 'Nuevo precio'}</ThemedText>

          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.campo}>
              <ThemedText type="small" themeColor="textSecondary">Referencia (número de la pieza, o edicion:caja)</ThemedText>
              <TextInput
                value={referencia}
                onChangeText={setReferencia}
                editable={!precio}
                autoCapitalize="none"
                style={[styles.input, { color: precio ? theme.textSecondary : theme.text }]}
              />
            </View>
            <View style={[styles.campo, styles.campoSinBorde]}>
              <ThemedText type="small" themeColor="textSecondary">Precio € (con IVA incluido)</ThemedText>
              <TextInput value={valor} onChangeText={setValor} keyboardType="decimal-pad" style={[styles.input, { color: theme.text }]} />
            </View>
          </View>

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          {precio && (
            <Pressable onPress={eliminar} style={styles.botonEliminar}>
              <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>Quitar precio propio</ThemedText>
            </Pressable>
          )}

          <View style={styles.botonGuardar}>
            <BotonPrimario texto="Guardar" onPress={guardar} cargando={guardando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.one },
  titulo: { fontSize: 26, lineHeight: 31 },
  nota: { lineHeight: 18, marginBottom: Spacing.one },
  centro: { marginTop: Spacing.five },
  formCard: { borderRadius: 16, paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  campo: { paddingVertical: Spacing.two, gap: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  campoSinBorde: { borderBottomWidth: 0 },
  input: { fontSize: 16, paddingVertical: 4 },
  error: { marginTop: Spacing.one },
  botonEliminar: { alignItems: 'center', marginTop: Spacing.three },
  botonGuardar: { marginTop: Spacing.three },
});
