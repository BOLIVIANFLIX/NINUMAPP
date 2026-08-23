import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerDocumentoDetalle, urlDocumentoArchivo } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Réplica de /panel/pedidos/documento -- "Ver documento"/"PDF"/"Word"/"Compartir"
// se abren TODOS igual: descargando primero el archivo con el token de la app (el
// endpoint exige sesión vía Authorization, ver auth.usuario_actual) y entregándolo
// después al selector nativo (Sharing.shareAsync, que en Android/iOS también ofrece
// "abrir con..."). Antes se pasaba la URL protegida directa a Linking.openURL/
// Share.share -- el navegador o la app de destino no llevan el token de la app, así
// que siempre daba "Falta iniciar sesión" en vez de abrir el documento (bug real
// descubierto el 2026-08-23).
export function DocumentoDetalle({ numero, etiquetaVolver, onVolver }: { numero: string; etiquetaVolver: string; onVolver: () => void }) {
  const theme = useTheme();
  const [descargando, setDescargando] = useState<'pdf' | 'docx' | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['documento', numero], queryFn: () => obtenerDocumentoDetalle(numero) });

  async function abrir(tipo: 'pdf' | 'docx') {
    setDescargando(tipo);
    try {
      const token = tokenStore.getAccessToken();
      const destino = new File(Paths.cache, `albaran-${numero}.${tipo}`);
      const archivo = await File.downloadFileAsync(urlDocumentoArchivo(numero, tipo), destino, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        idempotent: true,
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri);
    } catch {
      Alert.alert('No se ha podido abrir', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setDescargando(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← {etiquetaVolver}
            </ThemedText>
          </Pressable>
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
                <FilaFicha etiqueta="Total" valor={eur.format(data.total)} last />
              </Ficha>

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

              <Pressable onPress={() => abrir('pdf')} disabled={!!descargando} style={[styles.botonVer, { backgroundColor: theme.accent, opacity: descargando ? 0.5 : 1 }]}>
                {descargando === 'pdf' ? <ActivityIndicator color="#fff" /> : (
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    👁️ Ver documento
                  </ThemedText>
                )}
              </Pressable>

              <View style={styles.filaBotones}>
                <Pressable onPress={() => abrir('pdf')} disabled={!!descargando} style={[styles.botonCompartir, { backgroundColor: theme.backgroundElement, opacity: descargando ? 0.5 : 1 }]}>
                  <ThemedText type="smallBold">📤 Compartir</ThemedText>
                </Pressable>
              </View>
              <View style={styles.filaBotones}>
                <Pressable onPress={() => abrir('pdf')} disabled={!!descargando} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement, opacity: descargando ? 0.5 : 1 }]}>
                  {descargando === 'pdf' ? <ActivityIndicator color={theme.accent} /> : (
                    <ThemedText type="small" style={{ fontWeight: '700' }}>
                      ⬇️ PDF
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable onPress={() => abrir('docx')} disabled={!!descargando} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement, opacity: descargando ? 0.5 : 1 }]}>
                  {descargando === 'docx' ? <ActivityIndicator color={theme.accent} /> : (
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
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one, marginBottom: Spacing.two },
  centro: { marginTop: Spacing.five },
  ficha: { marginBottom: Spacing.two },
  botonVer: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.two },
  filaBotones: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  botonCompartir: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  botonDescargar: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
