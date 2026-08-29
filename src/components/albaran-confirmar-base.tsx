/** Núcleo compartido de "revisar y confirmar un borrador de albarán" -- líneas,
 * totales, aviso de materia prima faltante, número de albarán, confirmar (con aviso
 * de punto de no retorno) o descartar, y la pantalla de resultado con descarga.
 * GrandFoliesConfirmar y B2BCarritoConfirmar vivían casi duplicados byte a byte
 * (95%+): solo difieren en de dónde sale la fecha de entrega, si hay banner de "ya
 * pagado", y la llamada real a confirmar/descartar -- eso se queda en cada wrapper,
 * todo lo demás vive aquí. Revisión de calidad de código, 2026-08-27. */

import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, urlDescargarAlbaran, type FaltanteMateriaPrima, type ResultadoAlbaran } from '@/lib/api';
import { descargarACache } from '@/lib/descargas';

const MIME: Record<'docx' | 'pdf', string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

type LineaConfirmable = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
};

export function AlbaranConfirmarBase<L extends LineaConfirmable>({
  onVolver,
  onResuelto,
  onConfirmado,
  titulo,
  subtitulo,
  banner,
  lineasIniciales,
  faltantes,
  seccionExtra,
  tituloConfirmarAlert,
  validarAntesDeConfirmar,
  confirmarDeshabilitado,
  confirmar,
  descartar,
  sesion,
  prefijoDescarga,
}: {
  onVolver: () => void;
  onResuelto: () => void;
  /** Ariadna, 2026-08-29: confirmó el mismo pedido 3 veces porque, tras confirmar,
   * la lista de Avisos seguía mostrándolo como pendiente hasta pulsar "Volver a
   * Avisos" (onResuelto, que es lo único que refrescaba esa lista) -- si algo fallaba
   * al descargar el documento y no llegaba a pulsar ese botón, todo indicaba que el
   * pedido seguía sin confirmar. Se llama en cuanto el albarán real ya existe
   * (antes de mostrar la pantalla de descarga), para que la lista quede correcta
   * pase lo que pase después con la descarga -- onResuelto sigue siendo el único que
   * además navega de vuelta a Avisos. */
  onConfirmado?: () => void;
  titulo: string;
  subtitulo: ReactNode;
  banner?: ReactNode;
  lineasIniciales: L[];
  faltantes?: FaltanteMateriaPrima[] | null;
  /** Se muestra entre el aviso de materia prima y "Número de albarán" -- p.ej. el
   * selector de fecha de entrega en B2BCarritoConfirmar. */
  seccionExtra?: ReactNode;
  tituloConfirmarAlert: string;
  /** Validación previa a la propia confirmación de "punto de no retorno" -- devuelve
   * un mensaje de error si algo falta (p.ej. B2B sin fecha de entrega), o null si
   * puede continuar. */
  validarAntesDeConfirmar?: () => string | null;
  confirmarDeshabilitado?: boolean;
  confirmar: (numeroManual: string | null, lineas: L[]) => Promise<ResultadoAlbaran>;
  descartar: () => Promise<void>;
  /** El id del pedido (Grand Folies o carrito B2B) -- una vez generado el albarán,
   * es también la "sesion" real que usa el backend para servir la descarga (ver
   * ninuma-agente: el pedido queda registrado con ese mismo id de sesión). */
  sesion: string;
  prefijoDescarga: string;
}) {
  const theme = useTheme();
  const [lineas, setLineas] = useState<L[]>(lineasIniciales);
  const [numeroManual, setNumeroManual] = useState('');
  const [numeroModo, setNumeroModo] = useState<'auto' | 'blank' | 'manual'>('auto');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAlbaran | null>(null);

  function cambiarLinea(indice: number, campo: 'cantidad' | 'precio_unitario', texto: string) {
    const valor = Number(texto.replace(',', '.'));
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: Number.isFinite(valor) ? valor : l[campo] } : l)));
  }

  function pedirConfirmacion() {
    const avisoValidacion = validarAntesDeConfirmar?.();
    if (avisoValidacion) {
      Alert.alert('Falta un dato', avisoValidacion);
      return;
    }
    Alert.alert(
      tituloConfirmarAlert,
      'Esto genera el albarán real: consume numeración, descuenta stock en Grocy y se apunta en la contabilidad. No se puede deshacer desde la app. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: confirmarYGuardar },
      ],
    );
  }

  async function confirmarYGuardar() {
    setCargando(true);
    setError(null);
    try {
      const numero_manual = numeroModo === 'auto' ? null : numeroModo === 'blank' ? '' : numeroManual.trim();
      const resp = await confirmar(numero_manual, lineas);
      setResultado(resp);
      onConfirmado?.();
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
            await descartar();
            onResuelto();
          } catch (err) {
            setError(mensajeError(err));
            setCargando(false);
          }
        },
      },
    ]);
  }

  // Ariadna, 2026-08-29: "el albarán se genera pero no descarga, lo que hace es la
  // opción de enviar" -- descargarYCompartir (lib/descargas.ts) siempre comparte, no
  // guarda nada de verdad en el teléfono. documento-detalle.tsx ya se corrigió para
  // esto el 2026-08-23 ("descargar... hace la función de compartir, no descarga a mi
  // teléfono"), pero esta pantalla (confirmar Grand Folies/carrito B2B) es un sitio
  // distinto que se quedó con el comportamiento viejo. Mismo Storage Access
  // Framework que ya usa esa otra pantalla en Android -- descarga de verdad ahí,
  // comparte en iOS (sin SAF).
  async function descargarDocumento(tipo: 'docx' | 'pdf') {
    try {
      const archivo = await descargarACache(urlDescargarAlbaran(sesion, tipo), `${prefijoDescarga}-${sesion}.${tipo}`);
      if (Platform.OS === 'android') {
        const permiso = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permiso.granted) return;
        const base64 = await StorageAccessFramework.readAsStringAsync(archivo.uri, { encoding: 'base64' });
        const destinoUri = await StorageAccessFramework.createFileAsync(permiso.directoryUri, `${prefijoDescarga}-${sesion}`, MIME[tipo]);
        await StorageAccessFramework.writeAsStringAsync(destinoUri, base64, { encoding: 'base64' });
        Alert.alert('Descargado', `${prefijoDescarga}-${sesion}.${tipo} guardado correctamente.`);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(archivo.uri);
      }
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
            {resultado.ruta_docx && <BotonPrimario texto="⬇️ Descargar Word" onPress={() => descargarDocumento('docx')} />}
            {resultado.ruta_pdf && !resultado.pdf_fallo && (
              <View style={{ marginTop: Spacing.two }}>
                <BotonPrimario texto="⬇️ Descargar PDF" onPress={() => descargarDocumento('pdf')} />
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
            {titulo}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitulo}
          </ThemedText>
          {banner}

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

          {!!faltantes?.length && (
            <View style={[styles.avisoFaltantes, { backgroundColor: theme.warningSoft }]}>
              <ThemedText type="small" style={{ color: theme.warningText, fontWeight: '700' }}>
                ⚠️ Puede faltar materia prima:
              </ThemedText>
              {faltantes.map((f) => (
                <ThemedText key={f.producto} type="small" style={{ color: theme.warningText }}>
                  {f.producto}: faltan {f.falta}
                </ThemedText>
              ))}
            </View>
          )}

          {seccionExtra}

          <SectionLabel>Número de albarán</SectionLabel>
          <Pressable onPress={() => setNumeroModo('auto')} style={styles.opcionNumero}>
            <ThemedText type="small">{numeroModo === 'auto' ? '● ' : '○ '}Automático</ThemedText>
          </Pressable>
          <Pressable onPress={() => setNumeroModo('blank')} style={styles.opcionNumero}>
            <ThemedText type="small">{numeroModo === 'blank' ? '● ' : '○ '}Sin número</ThemedText>
          </Pressable>
          <Pressable onPress={() => setNumeroModo('manual')} style={styles.opcionNumero}>
            <ThemedText type="small">{numeroModo === 'manual' ? '● ' : '○ '}Elegir a mano</ThemedText>
          </Pressable>
          {numeroModo === 'manual' && (
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
                <BotonPrimario texto="Confirmar y generar" onPress={pedirConfirmacion} disabled={confirmarDeshabilitado} />
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
