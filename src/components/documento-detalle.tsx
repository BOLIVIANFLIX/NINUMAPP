import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { getContentUriAsync, StorageAccessFramework } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { marcarFacturado, mensajeError, obtenerDocumentoDetalle, urlDocumentoArchivo } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const MIME: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Ver/Compartir/PDF/Word antes hacían TODOS lo mismo (descargar a caché + abrir el
 * selector nativo de compartir) -- Ariadna, 2026-08-23: "ver documento es igual que
 * compartir" y "descargar... hace la función de compartir, no descarga a mi
 * teléfono". Ahora son 3 acciones de verdad:
 * - Ver: abre el PDF con un visor instalado (ACTION_VIEW de Android), sin pasar por
 *   el selector de "compartir con...".
 * - Compartir: sigue siendo el selector nativo (Sharing.shareAsync) -- esto sí es
 *   compartir, se queda igual.
 * - PDF/Word: Storage Access Framework -- le pide UNA vez elegir una carpeta (p.ej.
 *   Descargas) y escribe el archivo ahí de verdad, no es un "compartir" disfrazado. */
async function descargarACache(numero: string, tipo: 'pdf' | 'docx'): Promise<File> {
  const token = tokenStore.getAccessToken();
  const destino = new File(Paths.cache, `albaran-${numero}.${tipo}`);
  return File.downloadFileAsync(urlDocumentoArchivo(numero, tipo), destino, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    idempotent: true,
  });
}

export function DocumentoDetalle({
  numero,
  etiquetaVolver,
  onVolver,
  onAnterior,
  onSiguiente,
}: {
  numero: string;
  etiquetaVolver: string;
  onVolver: () => void;
  /** Si se pasan, se pinta una barra "‹ Anterior / Siguiente ›" para moverse por el
   * mismo listado (cronológico) desde el que se abrió este documento -- pedido
   * explícito de Ariadna 2026-08-23, aplica a cualquier sitio de la app que muestre
   * documentos. undefined = no hay más en esa dirección. */
  onAnterior?: () => void;
  onSiguiente?: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [accionEnCurso, setAccionEnCurso] = useState<'ver' | 'compartir' | 'pdf' | 'docx' | 'facturar' | null>(null);
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['documento', numero], queryFn: () => obtenerDocumentoDetalle(numero) });

  async function facturar() {
    setAccionEnCurso('facturar');
    try {
      await marcarFacturado(numero);
      await queryClient.invalidateQueries({ queryKey: ['documento', numero] });
    } catch (err) {
      Alert.alert('No se ha podido facturar', mensajeError(err));
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function ver() {
    setAccionEnCurso('ver');
    try {
      const archivo = await descargarACache(numero, 'pdf');
      if (Platform.OS === 'android') {
        const contentUri = await getContentUriAsync(archivo.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: MIME.pdf,
        });
      } else if (await Sharing.isAvailableAsync()) {
        // iOS no tiene un ACTION_VIEW equivalente -- el selector nativo aquí sí
        // ofrece "Vista rápida"/abrir con un visor, no solo "compartir con...".
        await Sharing.shareAsync(archivo.uri);
      }
    } catch {
      Alert.alert('No se ha podido abrir', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function compartir() {
    setAccionEnCurso('compartir');
    try {
      const archivo = await descargarACache(numero, 'pdf');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri);
    } catch {
      Alert.alert('No se ha podido compartir', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function descargar(tipo: 'pdf' | 'docx') {
    setAccionEnCurso(tipo);
    try {
      const archivo = await descargarACache(numero, tipo);
      if (Platform.OS === 'android') {
        const permiso = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permiso.granted) return;
        const base64 = await StorageAccessFramework.readAsStringAsync(archivo.uri, { encoding: 'base64' });
        const destinoUri = await StorageAccessFramework.createFileAsync(permiso.directoryUri, `Albaran_${numero}`, MIME[tipo]);
        await StorageAccessFramework.writeAsStringAsync(destinoUri, base64, { encoding: 'base64' });
        Alert.alert('Descargado', `Albaran_${numero}.${tipo} guardado correctamente.`);
      } else if (await Sharing.isAvailableAsync()) {
        // Storage Access Framework es solo Android -- en iOS el selector nativo ya
        // ofrece "Guardar en Archivos", que es el equivalente real a descargar.
        await Sharing.shareAsync(archivo.uri);
      }
    } catch {
      Alert.alert('No se ha podido descargar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setAccionEnCurso(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <View style={styles.filaCabecera}>
            <Pressable onPress={onVolver}>
              <ThemedText type="link" themeColor="textSecondary">
                ← {etiquetaVolver}
              </ThemedText>
            </Pressable>
            {(onAnterior || onSiguiente) && (
              <View style={styles.filaNav}>
                <Pressable onPress={onAnterior} disabled={!onAnterior} hitSlop={8}>
                  <ThemedText type="smallBold" style={{ color: onAnterior ? theme.accent : theme.textSecondary, opacity: onAnterior ? 1 : 0.3 }}>
                    ‹ Anterior
                  </ThemedText>
                </Pressable>
                <Pressable onPress={onSiguiente} disabled={!onSiguiente} hitSlop={8}>
                  <ThemedText type="smallBold" style={{ color: onSiguiente ? theme.accent : theme.textSecondary, opacity: onSiguiente ? 1 : 0.3 }}>
                    Siguiente ›
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
          <ThemedText type="title" style={styles.titulo}>
            Albarán {numero}
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {mensajeError(error)}
            </ThemedText>
          )}

          {data && (
            <>
              <Ficha style={styles.ficha}>
                <FilaFicha etiqueta="Cliente" valor={data.cliente} />
                <FilaFicha etiqueta="Fecha" valor={data.fecha_documento} />
                <FilaFicha etiqueta="Total" valor={eur.format(data.total)} last={data.facturado === undefined} />
                {data.facturado !== undefined && (
                  <FilaFicha etiqueta="Facturado" valor={data.facturado ? '✅ Sí' : 'Todavía no'} last />
                )}
              </Ficha>

              {data.facturado === false && (
                <Pressable
                  onPress={facturar}
                  disabled={!!accionEnCurso}
                  style={[styles.botonFacturar, { borderColor: theme.accent, opacity: accionEnCurso ? 0.5 : 1 }]}>
                  {accionEnCurso === 'facturar' ? <ActivityIndicator color={theme.accent} /> : (
                    <ThemedText type="smallBold" style={{ color: theme.accent }}>
                      🧾 Marcar facturado
                    </ThemedText>
                  )}
                </Pressable>
              )}

              {!!data.lineas?.length && (
                <Ficha style={styles.ficha}>
                  {data.lineas.map((l, i) => (
                    <FilaFicha
                      key={`${l.descripcion}-${i}`}
                      etiqueta={`${l.descripcion} ×${l.unidades}`}
                      valor={eur.format(l.importe)}
                      last={i === data.lineas!.length - 1}
                    />
                  ))}
                </Ficha>
              )}

              <Pressable onPress={ver} disabled={!!accionEnCurso} style={[styles.botonVer, { backgroundColor: theme.accent, opacity: accionEnCurso ? 0.5 : 1 }]}>
                {accionEnCurso === 'ver' ? <ActivityIndicator color="#fff" /> : (
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    👁️ Ver documento
                  </ThemedText>
                )}
              </Pressable>

              <View style={styles.filaBotones}>
                <Pressable onPress={compartir} disabled={!!accionEnCurso} style={[styles.botonCompartir, { backgroundColor: theme.backgroundElement, opacity: accionEnCurso ? 0.5 : 1 }]}>
                  {accionEnCurso === 'compartir' ? <ActivityIndicator color={theme.accent} /> : <ThemedText type="smallBold">📤 Compartir</ThemedText>}
                </Pressable>
              </View>
              <View style={styles.filaBotones}>
                <Pressable onPress={() => descargar('pdf')} disabled={!!accionEnCurso} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement, opacity: accionEnCurso ? 0.5 : 1 }]}>
                  {accionEnCurso === 'pdf' ? <ActivityIndicator color={theme.accent} /> : (
                    <ThemedText type="small" style={{ fontWeight: '700' }}>
                      ⬇️ PDF
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable onPress={() => descargar('docx')} disabled={!!accionEnCurso} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement, opacity: accionEnCurso ? 0.5 : 1 }]}>
                  {accionEnCurso === 'docx' ? <ActivityIndicator color={theme.accent} /> : (
                    <ThemedText type="small" style={{ fontWeight: '700' }}>
                      ⬇️ Word
                    </ThemedText>
                  )}
                </Pressable>
              </View>
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
  filaCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filaNav: { flexDirection: 'row', gap: Spacing.three },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one, marginBottom: Spacing.two },
  centro: { marginTop: Spacing.five },
  ficha: { marginBottom: Spacing.two },
  botonVer: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.two },
  botonFacturar: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, marginBottom: Spacing.two },
  filaBotones: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  botonCompartir: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  botonDescargar: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
