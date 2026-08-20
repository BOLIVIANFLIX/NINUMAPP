import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Pantalla provisional para las pestañas todavía no construidas -- se sustituye
 * pantalla a pantalla, sin bloquear el esqueleto de navegación mientras tanto. */
export function PantallaEnConstruccion({ titulo }: { titulo: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={{ color: theme.accent }}>
          {titulo}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Todavía por construir.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
});
