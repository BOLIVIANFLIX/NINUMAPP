import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Cámara a pantalla completa con un botón de disparo -- devuelve el URI local de la
 * foto vía onFoto, sin subir nada todavía (eso lo hace la pantalla que la usa). También
 * deja elegir una imagen ya hecha de la galería (p.ej. una foto sacada con otro móvil) --
 * mismo onFoto, mismo formato de URI, la pantalla que llama no distingue de dónde vino. */
export function EscanerCamara({ onFoto, onCancelar }: { onFoto: (uri: string) => void; onCancelar: () => void }) {
  const camaraRef = useRef<CameraView>(null);
  const [permiso, pedirPermiso] = useCameraPermissions();

  async function elegirDeGaleria() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!resultado.canceled && resultado.assets[0]) onFoto(resultado.assets[0].uri);
  }

  if (!permiso) {
    return null;
  }

  if (!permiso.granted) {
    return (
      <ThemedView style={styles.centro}>
        <SafeAreaView style={styles.avisoPermiso}>
          <ThemedText type="default" style={styles.textoCentro}>
            NINUMAPP necesita la cámara para escanear.
          </ThemedText>
          <BotonPrimario texto="Dar permiso" onPress={pedirPermiso} />
          <Pressable onPress={elegirDeGaleria}>
            <ThemedText type="link" style={styles.textoCentro}>
              📁 Subir una foto ya hecha
            </ThemedText>
          </Pressable>
          <Pressable onPress={onCancelar}>
            <ThemedText type="link" themeColor="textSecondary" style={styles.textoCentro}>
              Cancelar
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  async function disparar() {
    const foto = await camaraRef.current?.takePictureAsync({ quality: 0.7 });
    if (foto?.uri) onFoto(foto.uri);
  }

  return (
    <View style={styles.container}>
      <CameraView ref={camaraRef} style={styles.camara} />
      <SafeAreaView style={styles.cabecera}>
        <Pressable onPress={onCancelar}>
          <ThemedText type="link" style={styles.textoBlanco}>
            ✕ Cancelar
          </ThemedText>
        </Pressable>
      </SafeAreaView>
      <SafeAreaView style={styles.controles}>
        <BotonPrimario texto="📷 Hacer foto" onPress={disparar} />
        <Pressable onPress={elegirDeGaleria} style={styles.botonGaleria}>
          <ThemedText type="link" style={styles.textoBlanco}>
            📁 O subir una foto ya hecha
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camara: { flex: 1 },
  cabecera: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.four },
  controles: { padding: Spacing.four, gap: Spacing.two },
  botonGaleria: { alignItems: 'center' },
  centro: { flex: 1, justifyContent: 'center' },
  avisoPermiso: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  textoCentro: { textAlign: 'center' },
  textoBlanco: { color: '#fff' },
});
