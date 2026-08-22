import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Hueco preparado para cuando Ariadna dé el modelo de factura -- de momento solo
// "Albarán" lleva a algún sitio, "Factura" se ve pero no se puede tocar.
export function ElegirTipoDocumento({ onAlbaran, onVolver }: { onAlbaran: () => void; onVolver: () => void }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contenido}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Volver</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>Generar documentos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            ¿Qué quieres generar?
          </ThemedText>

          <ListCard>
            <ListRow onPress={onAlbaran} title="📄 Albarán" subtitle="Genera un albarán real para un cliente" />
            <ListRow
              last
              title="🧾 Factura"
              subtitle="Próximamente"
              right={<ThemedText type="small" themeColor="textSecondary">🔒</ThemedText>}
            />
          </ListCard>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  contenido: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  nota: { marginBottom: Spacing.one },
});
