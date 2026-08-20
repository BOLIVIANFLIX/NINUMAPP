import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { EscanerCamara } from '@/components/escaner-camara';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmarAlbaran, escanearAlbaran, mensajeError, type LineaAlbaran } from '@/lib/api';

// No es una ruta -- ver obrador.tsx: el layout raíz no tiene un Stack por encima de
// las pestañas, así que "empujar" una pantalla nueva con el router no funciona ni en
// web ni en nativo. Se muestra como una vista más dentro de la propia pestaña Obrador.
type Paso = 'camara' | 'leyendo' | 'revisar' | 'enviando' | 'hecho';

// Líneas con match por debajo de esto empiezan sin marcar -- mejor revisar a mano en
// Grocy que descontar ingredientes de la receta equivocada.
const UMBRAL_AUTOMARCAR = 0.75;

interface LineaEditable extends LineaAlbaran {
  incluida: boolean;
}

export function InventarioAlbaran({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [paso, setPaso] = useState<Paso>('camara');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function alHacerFoto(uri: string) {
    setPaso('leyendo');
    setError(null);
    try {
      const leidas = await escanearAlbaran(uri);
      setLineas(leidas.map((l) => ({ ...l, incluida: l.receta_id !== null && l.confianza >= UMBRAL_AUTOMARCAR })));
      setPaso('revisar');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('camara');
    }
  }

  async function confirmar() {
    setPaso('enviando');
    setError(null);
    try {
      const seleccionadas = lineas.filter((l) => l.incluida && l.receta_id !== null);
      await confirmarAlbaran(seleccionadas.map((l) => ({ receta_id: l.receta_id!, cantidad: l.cantidad })));
      setPaso('hecho');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('revisar');
    }
  }

  function actualizarLinea(index: number, cambios: Partial<LineaEditable>) {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, ...cambios } : l)));
  }

  if (paso === 'camara') return <EscanerCamara onFoto={alHacerFoto} onCancelar={onVolver} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.cabecera}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Obrador
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={{ color: theme.accent }}>
            Mi albarán
          </ThemedText>
        </ThemedView>

        {paso === 'leyendo' && (
          <ThemedView style={styles.centro}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              Leyendo el albarán...
            </ThemedText>
          </ThemedView>
        )}

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.aviso}>
            {error}
          </ThemedText>
        )}

        {paso === 'hecho' && (
          <ThemedView style={styles.centro}>
            <ThemedText type="default">✅ Ingredientes descontados en Grocy.</ThemedText>
            <BotonPrimario texto="Volver a Obrador" onPress={onVolver} />
          </ThemedView>
        )}

        {(paso === 'revisar' || paso === 'enviando') && (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              Revisa las líneas antes de confirmar -- las que no se han podido emparejar con una receta de Grocy
              empiezan sin marcar.
            </ThemedText>
            <FlatList
              data={lineas}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.lista}
              renderItem={({ item, index }) => (
                <LineaTarjeta linea={item} onCambiar={(cambios) => actualizarLinea(index, cambios)} />
              )}
            />
            <ThemedView style={styles.pie}>
              <BotonPrimario texto="Descontar ingredientes" onPress={confirmar} cargando={paso === 'enviando'} />
            </ThemedView>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function LineaTarjeta({ linea, onCambiar }: { linea: LineaEditable; onCambiar: (cambios: Partial<LineaEditable>) => void }) {
  const theme = useTheme();
  const sinEmparejar = linea.receta_id === null;

  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <Pressable
        onPress={() => !sinEmparejar && onCambiar({ incluida: !linea.incluida })}
        disabled={sinEmparejar}
        style={styles.filaSuperior}>
        <ThemedView
          style={[
            styles.casilla,
            { borderColor: theme.accent, backgroundColor: linea.incluida ? theme.accent : 'transparent' },
          ]}
        />
        <ThemedView style={styles.info}>
          <ThemedText type="default">{linea.receta_nombre ?? linea.producto_leido}</ThemedText>
          {sinEmparejar && (
            <ThemedText type="small" themeColor="danger">
              No encontrada en Grocy -- revisar a mano ("{linea.producto_leido}")
            </ThemedText>
          )}
        </ThemedView>
      </Pressable>
      <ThemedView style={styles.filaCantidad}>
        <ThemedText type="small" themeColor="textSecondary">
          Raciones
        </ThemedText>
        <TextInput
          value={String(linea.cantidad)}
          onChangeText={(t) => onCambiar({ cantidad: Number(t.replace(',', '.')) || 0 })}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.two, paddingBottom: BottomTabInset },
  cabecera: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.one },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  aviso: { lineHeight: 20, paddingHorizontal: Spacing.four },
  lista: { padding: Spacing.four, gap: Spacing.three },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  filaSuperior: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  casilla: { width: 22, height: 22, borderRadius: Spacing.one, borderWidth: 2 },
  info: { flex: 1, gap: Spacing.half },
  filaCantidad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, width: 80, textAlign: 'center' },
  pie: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
});
