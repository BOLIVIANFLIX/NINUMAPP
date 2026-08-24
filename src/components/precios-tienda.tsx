import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  eliminarPrecioTienda,
  guardarPrecioTienda,
  mensajeError,
  obtenerCatalogoTienda,
  type PiezaCatalogo,
} from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const ETIQUETAS_CATEGORIA: Record<string, string> = {
  tartas: 'Tartas',
  bombones: 'Bombones',
  postres: 'Postres',
  ediciones: 'Ediciones',
  b2b: 'B2B',
  merch: 'Merchandising',
};

type Vista = { tipo: 'catalogo' } | { tipo: 'manual' };

// Ficha de cada producto con foto -- activar/desactivar la venta y poner el precio
// se refleja en /tienda/ y en el checkout de Stripe sin desplegar nada (ver
// WBD/src/lib/preciosOverride.ts, WBD/src/pages/api/agente-catalogo.ts).
export function PreciosTienda({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>({ tipo: 'catalogo' });
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['catalogo-tienda'], queryFn: obtenerCatalogoTienda });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo-tienda'] });
  }

  if (vista.tipo === 'manual') {
    return <PrecioManualForm onVolver={() => setVista({ tipo: 'catalogo' })} onGuardado={invalidar} />;
  }

  const grupos = new Map<string, PiezaCatalogo[]>();
  for (const p of data?.piezas ?? []) {
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
    grupos.get(p.categoria)!.push(p);
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
          <ThemedText type="title" style={styles.titulo}>Productos de la tienda</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Activa lo que tengas producido y ponle precio -- se ve reflejado en la web al momento, sin desplegar nada.
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}
          {data?.aviso && <ThemedText type="small" themeColor="textSecondary">ℹ️ {data.aviso}</ThemedText>}

          {[...grupos.entries()].map(([categoria, piezas]) => (
            <View key={categoria}>
              <SectionLabel>{ETIQUETAS_CATEGORIA[categoria] ?? categoria}</SectionLabel>
              <View style={styles.rejilla}>
                {piezas.map((p) => (
                  <FichaProducto key={p.numero} pieza={p} onCambiado={invalidar} />
                ))}
              </View>
            </View>
          ))}

          <Pressable onPress={() => setVista({ tipo: 'manual' })} style={styles.enlaceManual}>
            <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700' }}>
              Precio manual (cajas de ediciones especiales) ›
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FichaProducto({ pieza, onCambiado }: { pieza: PiezaCatalogo; onCambiado: () => void }) {
  const theme = useTheme();
  const [precioTexto, setPrecioTexto] = useState(pieza.precio_efectivo > 0 ? String(pieza.precio_efectivo) : '');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);
  const [cambiandoActivo, setCambiandoActivo] = useState(false);

  async function alCambiarActivo(nuevoValor: boolean) {
    if (nuevoValor) {
      const precio = parseFloat(precioTexto.replace(',', '.'));
      if (!precioTexto || Number.isNaN(precio) || precio <= 0) {
        Alert.alert('Falta el precio', 'Pon un precio antes de activar la venta.');
        return;
      }
    }
    setCambiandoActivo(true);
    try {
      await guardarPrecioTienda(pieza.numero, undefined, nuevoValor);
      onCambiado();
    } catch (err) {
      Alert.alert('Error', mensajeError(err));
    } finally {
      setCambiandoActivo(false);
    }
  }

  async function guardarPrecio() {
    const precio = parseFloat(precioTexto.replace(',', '.'));
    if (Number.isNaN(precio) || precio <= 0) {
      Alert.alert('Precio no válido', 'Pon un precio en euros mayor que 0.');
      return;
    }
    setGuardandoPrecio(true);
    try {
      await guardarPrecioTienda(pieza.numero, precio, undefined);
      onCambiado();
    } catch (err) {
      Alert.alert('Error', mensajeError(err));
    } finally {
      setGuardandoPrecio(false);
    }
  }

  return (
    <View style={[styles.ficha, { backgroundColor: theme.backgroundElement }]}>
      <Image source={{ uri: pieza.imagen }} style={[styles.imagen, { backgroundColor: theme.backgroundSelected }]} contentFit="cover" transition={150} />
      <View style={styles.fichaCuerpo}>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.nombre}>
          {pieza.nombre}
        </ThemedText>
        <View style={styles.filaPrecio}>
          <TextInput
            value={precioTexto}
            onChangeText={setPrecioTexto}
            onEndEditing={guardarPrecio}
            keyboardType="decimal-pad"
            placeholder="€"
            placeholderTextColor={theme.textSecondary}
            style={[styles.inputPrecio, { color: theme.text, borderColor: theme.separator }]}
          />
          {guardandoPrecio && <ActivityIndicator size="small" color={theme.accent} />}
        </View>
        <View style={styles.filaSwitch}>
          <ThemedText type="small" themeColor={pieza.activo ? undefined : 'textSecondary'}>
            {pieza.activo ? 'En venta' : 'No en venta'}
          </ThemedText>
          {cambiandoActivo ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Switch value={pieza.activo} onValueChange={alCambiarActivo} />
          )}
        </View>
      </View>
    </View>
  );
}

function PrecioManualForm({ onVolver, onGuardado }: { onVolver: () => void; onGuardado: () => void }) {
  const theme = useTheme();
  const [referencia, setReferencia] = useState('');
  const [valor, setValor] = useState('');
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
      await guardarPrecioTienda(referencia.trim(), num, true);
      onGuardado();
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function quitar() {
    if (!referencia.trim()) return;
    Alert.alert('¿Quitar este precio propio?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await eliminarPrecioTienda(referencia.trim());
          onGuardado();
          onVolver();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Productos de la tienda</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>Precio manual</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Para cajas de una edición especial activa (referencia tipo "slug-edicion:caja-3") -- las ediciones se siguen
            creando por código, esto solo cambia el precio de una caja ya publicada.
          </ThemedText>

          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.campo}>
              <ThemedText type="small" themeColor="textSecondary">Referencia</ThemedText>
              <TextInput
                value={referencia}
                onChangeText={setReferencia}
                autoCapitalize="none"
                style={[styles.input, { color: theme.text }]}
              />
            </View>
            <View style={[styles.campo, styles.campoSinBorde]}>
              <ThemedText type="small" themeColor="textSecondary">Precio € (con IVA incluido)</ThemedText>
              <TextInput value={valor} onChangeText={setValor} keyboardType="decimal-pad" style={[styles.input, { color: theme.text }]} />
            </View>
          </View>

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <Pressable onPress={quitar} style={styles.botonEliminar}>
            <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>Quitar precio propio de esta referencia</ThemedText>
          </Pressable>

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
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  nota: { lineHeight: 18, marginBottom: Spacing.one },
  centro: { marginTop: Spacing.five },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  ficha: { width: '47%', borderRadius: 16, overflow: 'hidden' },
  imagen: { width: '100%', aspectRatio: 1 },
  fichaCuerpo: { padding: Spacing.two, gap: 6 },
  nombre: { minHeight: 32 },
  filaPrecio: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  inputPrecio: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  enlaceManual: { marginTop: Spacing.four, alignItems: 'center' },
  formCard: { borderRadius: 16, paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  campo: { paddingVertical: Spacing.two, gap: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  campoSinBorde: { borderBottomWidth: 0 },
  input: { fontSize: 16, paddingVertical: 4 },
  error: { marginTop: Spacing.one },
  botonEliminar: { alignItems: 'center', marginTop: Spacing.three },
  botonGuardar: { marginTop: Spacing.three },
});
