/** Núcleo compartido de "revisar y confirmar un borrador de albarán" -- líneas,
 * totales, aviso de materia prima faltante, número de albarán, confirmar (con aviso
 * de punto de no retorno) o descartar, y la pantalla de resultado con descarga.
 * GrandFoliesConfirmar y B2BCarritoConfirmar vivían casi duplicados byte a byte
 * (95%+): solo difieren en de dónde sale la fecha de entrega, si hay banner de "ya
 * pagado", y la llamada real a confirmar/descartar -- eso se queda en cada wrapper,
 * todo lo demás vive aquí. Revisión de calidad de código, 2026-08-27. */

import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, urlDescargarAlbaran, type FaltanteMateriaPrima, type ResultadoAlbaran } from '@/lib/api';
import { descargarYCompartir } from '@/lib/descargas';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

type LineaConfirmable = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
};

export function AlbaranConfirmarBase<L extends LineaConfirmable>({
  onVolver,
  onResuelto,
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

  async function descargarDocumento(tipo: 'docx' | 'pdf') {
    try {
      await descargarYCompartir(urlDescargarAlbaran(sesion, tipo), `${prefijoDescarga}-${sesion}.${tipo}`);
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
