/** Revisar un pedido de Grand Folies detectado por email (ver ninuma-agente,
 * corre solo -- este componente solo confirma o descarta un borrador ya creado).
 * Confirmar reutiliza el mismo camino que generar un albarán normal (descuento de
 * stock real, contabilidad, documento) -- mismo aviso de punto de no retorno. */

import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmarGrandFolies,
  descartarGrandFolies,
  mensajeError,
  urlDescargarAlbaran,
  type LineaGrandFolies,
  type PedidoGrandFolies,
  type ResultadoAlbaran,
} from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function GrandFoliesConfirmar({ pedido, onVolver, onResuelto }: { pedido: PedidoGrandFolies; onVolver: () => void; onResuelto: () => void }) {
  const theme = useTheme();
  const [lineas, setLineas] = useState<LineaGrandFolies[]>(pedido.lineas);
  const [numeroManual, setNumeroManual] = useState('');
  const [usarNumeroManual, setUsarNumeroManual] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAlbaran | null>(null);
  const [sesionDescarga, setSesionDescarga] = useState<string | null>(null);

  function cambiarLinea(indice: number, campo: 'cantidad' | 'precio_unitario', texto: string) {
    const valor = Number(texto.replace(',', '.'));
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: Number.isFinite(valor) ? valor : l[campo] } : l)));
  }

  function pedirConfirmacion() {
    Alert.alert(
      'Confirmar pedido de Grand Folies',
      'Esto genera el albarán real: consume numeración, descuenta stock en Grocy y se apunta en la contabilidad. No se puede deshacer desde la app. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: confirmar },
      ],
    );
  }

  async function confirmar() {
    setCargando(true);
    setError(null);
    try {
      const resp = await confirmarGrandFolies(
        pedido.id,
        pedido.fecha_entrega,
        pedido.numero_pedido,
        usarNumeroManual ? numeroManual.trim() : null,
        lineas,
      );
      setResultado(resp);
      setSesionDescarga(pedido.id);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function pedirDescarte() {
    Alert.alert('Descartar pedido', 'Se marcará como resuelto sin generar ningún albarán. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          setCargando(true);
          try {
            await descartarGrandFolies(pedido.id);
            onResuelto();
          } catch (err) {
            setError(mensajeError(err));
            setCargando(false);
          }
        },
      },
    ]);
  }

  async function descargar(tipo: 'docx' | 'pdf') {
    if (!sesionDescarga) return;
    try {
      const token = tokenStore.getAccessToken();
      const destino = new File(Paths.cache, `grand-folies-${sesionDescarga}.${tipo}`);
      const archivo = await File.downloadFileAsync(urlDescargarAlbaran(sesionDescarga, tipo), destino, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        idempotent: true,
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri);
    } catch {
      setError('No se ha podido descargar el documento.');
    }
  }

  if (resultado) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={[styles.hecho, { backgroundColor: theme.successSoft }]}>
              <ThemedText type="smallBold" style={{ color: theme.success }}>
                ✅ Albarán {resultado.numero_mostrado} generado
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                {resultado.resumen}
              </ThemedText>
            </View>
            {resultado.ruta_docx && <BotonPrimario texto="⬇️ Descargar Word" onPress={() => descargar('docx')} />}
            {resultado.ruta_pdf && !resultado.pdf_fallo && (
              <View style={{ marginTop: Spacing.two }}>
                <BotonPrimario texto="⬇️ Descargar PDF" onPress={() => descargar('pdf')} />
              </View>
            )}
            <Pressable onPress={onResuelto} style={styles.botonSecundario}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Volver a Avisos
              </ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const total = lineas.reduce((acc, l) => acc + l.cantidad * (l.precio_unitario ?? 0), 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Avisos
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Pedido Grand Folies
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {pedido.numero_pedido ?? 'Sin número'} · entrega {pedido.fecha_entrega ?? 'sin fecha'}
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <SectionLabel>Líneas (revisa cantidad y precio)</SectionLabel>
          <ListCard>
            {lineas.map((l, i) => (
              <View key={`${l.descripcion}-${i}`} style={[styles.filaLinea, i < lineas.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.separator }]}>
                <ThemedText type="smallBold">{l.descripcion}</ThemedText>
                <View style={styles.filaCampos}>
                  <TextInput
                    value={String(l.cantidad)}
                    onChangeText={(t) => cambiarLinea(i, 'cantidad', t)}
                    keyboardType="decimal-pad"
                    style={[styles.inputPequeno, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    ud ×
                  </ThemedText>
                  <TextInput
                    value={l.precio_unitario !== null ? String(l.precio_unitario) : ''}
                    onChangeText={(t) => cambiarLinea(i, 'precio_unitario', t)}
                    keyboardType="decimal-pad"
                    placeholder="precio"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.inputPequeno, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    €
                  </ThemedText>
                </View>
              </View>
            ))}
          </ListCard>

          <View style={[styles.totales, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Total estimado
            </ThemedText>
            <ThemedText type="smallBold">{eur.format(total)}</ThemedText>
          </View>

          {!!pedido.faltantes?.length && (
            <View style={[styles.avisoFaltantes, { backgroundColor: theme.warningSoft }]}>
              <ThemedText type="small" style={{ color: theme.warningText, fontWeight: '700' }}>
                ⚠️ Puede faltar materia prima:
              </ThemedText>
              {pedido.faltantes.map((f) => (
                <ThemedText key={f.producto} type="small" style={{ color: theme.warningText }}>
                  {f.producto}: faltan {f.falta}
                </ThemedText>
              ))}
            </View>
          )}

          <SectionLabel>Número de albarán</SectionLabel>
          <Pressable onPress={() => setUsarNumeroManual(false)} style={styles.opcionNumero}>
            <ThemedText type="small">{!usarNumeroManual ? '● ' : '○ '}Automático</ThemedText>
          </Pressable>
          <Pressable onPress={() => setUsarNumeroManual(true)} style={styles.opcionNumero}>
            <ThemedText type="small">{usarNumeroManual ? '● ' : '○ '}Elegir a mano</ThemedText>
          </Pressable>
          {usarNumeroManual && (
            <TextInput
              value={numeroManual}
              onChangeText={setNumeroManual}
              style={[styles.inputAncho, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          )}

          {cargando ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: Spacing.three }} />
          ) : (
            <>
              <View style={styles.botonesFila}>
                <BotonPrimario texto="Confirmar y generar" onPress={pedirConfirmacion} />
              </View>
              <Pressable onPress={pedirDescarte} style={styles.botonSecundario}>
                <ThemedText type="smallBold" themeColor="danger">
                  Descartar pedido
                </ThemedText>
              </Pressable>
            </>
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
  error: { lineHeight: 20 },
  filaLinea: { padding: Spacing.three, gap: Spacing.one },
  filaCampos: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  inputPequeno: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, fontSize: 14, width: 70 },
  inputAncho: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16, marginTop: Spacing.one },
  totales: { borderRadius: 16, padding: Spacing.three, flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two },
  avisoFaltantes: { borderRadius: 14, padding: Spacing.three, marginTop: Spacing.two, gap: 2 },
  opcionNumero: { paddingVertical: Spacing.one },
  botonesFila: { marginTop: Spacing.three },
  botonSecundario: { alignItems: 'center', paddingVertical: Spacing.three },
  hecho: { borderRadius: 16, padding: Spacing.three, marginBottom: Spacing.two },
});
