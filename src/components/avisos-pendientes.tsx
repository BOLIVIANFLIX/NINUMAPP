import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { emailAsignarDia, mensajeError, pedidoWebConfirmar, pedidoWebMover, type EncargoPendiente, type PedidoWebPendiente } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const ETIQUETAS_CATEGORIA: Record<string, string> = {
  encargo: 'Encargo', duda: 'Duda', queja: 'Queja', proveedor: 'Proveedor', otro: 'Otro',
};

// Réplica de /panel/avisos/email/{id} -- ficha + "Asignar un día" que crea un pedido
// real en la web (ninuma_web_client.crear_pedido) vía el bridge de ninuma-agente.
export function AsuntoEmail({ encargo, onVolver }: { encargo: EncargoPendiente; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState(encargo.resumen ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar() {
    if (!fecha || !descripcion.trim()) {
      setError('Falta la fecha o la descripción.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await emailAsignarDia(encargo.id, fecha, descripcion.trim());
      await queryClient.invalidateQueries({ queryKey: ['avisos-pendientes'] });
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
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Avisos</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {encargo.cliente || 'Sin nombre'}
          </ThemedText>

          <Ficha style={styles.ficha}>
            <FilaFicha etiqueta="Categoría" valor={ETIQUETAS_CATEGORIA[encargo.categoria] ?? encargo.categoria} />
            <FilaFicha etiqueta="Resumen" valor={encargo.resumen || '—'} />
            <FilaFicha etiqueta="Fecha mencionada" valor={encargo.fecha_mencionada || '—'} last={!encargo.urgente} />
            {encargo.urgente && <FilaFicha etiqueta="⚠️ Urgente" valor="" last />}
          </Ficha>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
            ASIGNAR UN DÍA (CREA UN PEDIDO DE PARTICULAR EN LA WEB)
          </ThemedText>
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={fecha}
              onChangeText={setFecha}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="¿Qué lleva el pedido?"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, styles.inputMultilinea, { color: theme.text, borderColor: theme.separator }]}
            />
          </View>

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="📅 Asignar día y crear pedido" onPress={asignar} cargando={guardando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Réplica de /panel/avisos/pedido-web/{locator} -- confirmar la fecha solicitada o
// moverlo a otro día, con sincronización de calendario (ninuma-agente lo hace).
export function AsuntoPedidoWeb({ pedido, onVolver }: { pedido: PedidoWebPendiente; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [fechaMover, setFechaMover] = useState('');
  const [accion, setAccion] = useState<'confirmar' | 'mover' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setAccion('confirmar');
    setError(null);
    try {
      await pedidoWebConfirmar(pedido.locator);
      await queryClient.invalidateQueries({ queryKey: ['avisos-pendientes'] });
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAccion(null);
    }
  }

  async function mover() {
    if (!fechaMover) {
      setError('Falta la fecha.');
      return;
    }
    setAccion('mover');
    setError(null);
    try {
      await pedidoWebMover(pedido.locator, fechaMover);
      await queryClient.invalidateQueries({ queryKey: ['avisos-pendientes'] });
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setAccion(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Avisos</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Pedido de la web
          </ThemedText>

          <Ficha style={styles.ficha}>
            <FilaFicha etiqueta="Cliente" valor={pedido.cliente || '—'} />
            <FilaFicha etiqueta="Tipo" valor={pedido.kind || '—'} />
            <FilaFicha etiqueta="Total" valor={eur.format((pedido.total_cents ?? 0) / 100)} />
            <FilaFicha etiqueta="Fecha solicitada" valor={pedido.recogida_fecha ? new Date(pedido.recogida_fecha).toLocaleDateString('es-ES') : 'Sin fecha'} last />
          </Ficha>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Esto es solo un recordatorio dentro de la app -- confirmar o mover la fecha aquí no cambia el pedido en la web ni avisa al cliente.
          </ThemedText>

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="✅ Confirmar esa fecha" onPress={confirmar} cargando={accion === 'confirmar'} disabled={accion === 'mover'} />
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
            O MOVERLO A OTRO DÍA
          </ThemedText>
          <View style={styles.filaMover}>
            <TextInput
              value={fechaMover}
              onChangeText={setFechaMover}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.separator }]}
            />
            <Pressable onPress={mover} disabled={accion === 'confirmar'} style={[styles.botonMover, { backgroundColor: theme.accent }]}>
              {accion === 'mover' ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>Mover</ThemedText>}
            </Pressable>
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
  ficha: { marginTop: Spacing.two },
  seccion: { marginTop: Spacing.three, marginBottom: Spacing.two, letterSpacing: 0.3 },
  nota: { lineHeight: 18 },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  inputMultilinea: { minHeight: 70, textAlignVertical: 'top' },
  error: { marginTop: Spacing.one },
  botonWrap: { marginTop: Spacing.two },
  filaMover: { flexDirection: 'row', gap: Spacing.two },
  botonMover: { borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
