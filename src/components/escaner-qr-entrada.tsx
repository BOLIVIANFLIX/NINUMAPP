import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** El QR que le llega al cliente por email ya es un enlace directo a la página real
 * de control de entrada (/cuenta/admin/checkin -- ver WBD/src/lib/email.ts,
 * WBD/src/pages/cuenta/admin/checkin.astro). No hace falta reimplementar la
 * validación: solo hay que leer el QR y abrir ese enlace -- la lógica de marcar
 * entrada, comprobar si ya estaba validada, etc. ya existe y funciona en la web.
 *
 * Dominios aceptados: el QR se genera con SITE_URL (ver WBD/src/lib/locator.ts),
 * que hoy en producción todavía es https://ninuma.netlify.app -- el cutover a
 * https://www.ninuma.es (ver WBD/src/env.d.ts) aún no se ha hecho. Ariadna,
 * 2026-08-24: ningún QR se validaba porque este escáner solo aceptaba "ninuma.es",
 * y el dominio real (netlify.app) nunca lo cumplía -- se acepta cualquiera de los
 * dos para que siga funcionando también después del cutover, sin tocar la app otra
 * vez ese día. */
const _DOMINIOS_VALIDOS = ["ninuma.netlify.app", "ninuma.es", "www.ninuma.es"];
export function EscanerQREntrada({ onVolver }: { onVolver: () => void }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [leido, setLeido] = useState(false);

  if (!permiso) return null;

  if (!permiso.granted) {
    return (
      <ThemedView style={styles.centro}>
        <SafeAreaView style={styles.avisoPermiso}>
          <ThemedText type="default" style={styles.textoCentro}>
            NINUMAPP necesita la cámara para escanear entradas.
          </ThemedText>
          <BotonPrimario texto="Dar permiso" onPress={pedirPermiso} />
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary" style={styles.textoCentro}>
              Cancelar
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  async function alLeer({ data }: { data: string }) {
    if (leido) return;
    setLeido(true);
    try {
      const url = new URL(data);
      if (_DOMINIOS_VALIDOS.includes(url.hostname) && url.pathname.startsWith('/cuenta/admin/checkin')) {
        await Linking.openURL(data);
        onVolver();
        return;
      }
    } catch {
      // no era una URL válida -- cae al aviso de abajo
    }
    setLeido(false);
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camara}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={leido ? undefined : alLeer}
      />
      <SafeAreaView style={styles.cabecera}>
        <Pressable onPress={onVolver}>
          <ThemedText type="link" style={styles.textoBlanco}>
            ✕ Cancelar
          </ThemedText>
        </Pressable>
      </SafeAreaView>
      <View style={styles.marco} pointerEvents="none" />
      <SafeAreaView style={styles.pie}>
        <ThemedText type="small" style={styles.textoBlanco}>
          Apunta al código QR de la entrada
        </ThemedText>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camara: { flex: 1 },
  cabecera: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.four },
  pie: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.four, alignItems: 'center' },
  marco: { position: 'absolute', top: '30%', left: '15%', right: '15%', bottom: '40%', borderWidth: 2, borderColor: '#fff', borderRadius: 16 },
  centro: { flex: 1, justifyContent: 'center' },
  avisoPermiso: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  textoCentro: { textAlign: 'center' },
  textoBlanco: { color: '#fff' },
});
