import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerDocumentoDetalle, urlDocumentoArchivo } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Réplica de /panel/pedidos/documento -- ver "Ver documento" (abre a pantalla
// completa vía Linking.openURL, mismo criterio que panel.py: un <iframe> no pinta
// PDFs de forma fiable dentro de una WebView/TWA) y "Compartir" (Share nativo).
export function DocumentoDetalle({ numero, etiquetaVolver, onVolver }: { numero: string; etiquetaVolver: string; onVolver: () => void }) {
  const theme = useTheme();
  const [compartiendo, setCompartiendo] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['documento', numero], queryFn: () => obtenerDocumentoDetalle(numero) });

  const urlPdf = urlDocumentoArchivo(numero, 'pdf');
  const urlDocx = urlDocumentoArchivo(numero, 'docx');

  async function compartir() {
    setCompartiendo(true);
    try {
      await Share.share({ url: urlPdf, message: `Albarán ${numero}: ${urlPdf}` });
    } catch {
      // cancelado por el usuario -- no interrumpir con un error
    } finally {
      setCompartiendo(false);
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

              <Pressable onPress={() => Linking.openURL(urlPdf)} style={[styles.botonVer, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>
                  👁️ Ver documento
                </ThemedText>
              </Pressable>

              <View style={styles.filaBotones}>
                <Pressable onPress={compartir} disabled={compartiendo} style={[styles.botonCompartir, { backgroundColor: theme.backgroundElement, opacity: compartiendo ? 0.5 : 1 }]}>
                  {compartiendo ? <ActivityIndicator color={theme.accent} /> : (
                    <ThemedText type="smallBold">📤 Compartir</ThemedText>
                  )}
                </Pressable>
              </View>
              <View style={styles.filaBotones}>
                <Pressable onPress={() => Linking.openURL(urlPdf)} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" style={{ fontWeight: '700' }}>
                    ⬇️ PDF
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => Linking.openURL(urlDocx)} style={[styles.botonDescargar, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" style={{ fontWeight: '700' }}>
                    ⬇️ Word
                  </ThemedText>
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
