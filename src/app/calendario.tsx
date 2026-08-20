import { Linking, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// v1 sencilla: enlace directo a Google Calendar (se abre en la app/navegador de
// verdad). Un calendario embebido en vivo exigiría hacerlo público u OAuth -- se deja
// para una fase posterior si hace falta.
const URL_CALENDARIO = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_URL;

export default function CalendarioScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={{ color: theme.accent }}>
          Calendario
        </ThemedText>

        {URL_CALENDARIO ? (
          <Pressable onPress={() => Linking.openURL(URL_CALENDARIO)}>
            <ThemedView type="backgroundElement" style={styles.tarjeta}>
              <ThemedText type="default">📅 Abrir Google Calendar</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Se abre en la app de Calendar o en el navegador.
              </ThemedText>
            </ThemedView>
          </Pressable>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            ℹ️ Calendario todavía no configurado -- falta EXPO_PUBLIC_GOOGLE_CALENDAR_URL.
          </ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.four, gap: Spacing.one },
  aviso: { lineHeight: 20 },
});
