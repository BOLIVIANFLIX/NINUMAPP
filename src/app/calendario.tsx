import { Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientCard } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// El mismo iframe que usa el panel web (ninuma-agente/panel.py `_seccion_calendario`),
// mostrado aquí en un WebView en vez de un <iframe> -- no hay forma nativa de
// "incrustar" un calendario en vivo sin repetir toda la lógica de eventos de la API
// de Google Calendar, así que reutilizamos el mismo embed público de Google.
const CALENDAR_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_ID;
const URL_CALENDARIO = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_URL;

const EMBED_URL = CALENDAR_ID
  ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(CALENDAR_ID)}&ctz=Europe%2FMadrid&mode=MONTH&showTitle=0&showPrint=0&showTz=0&showCalendars=0`
  : null;

export default function CalendarioScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.titulo}>
          Calendario
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
          Entregas, eventos y encargos, todo en un sitio
        </ThemedText>

        {EMBED_URL && Platform.OS !== 'web' ? (
          <WebView source={{ uri: EMBED_URL }} style={[styles.webview, { backgroundColor: theme.backgroundElement }]} startInLoadingState />
        ) : !EMBED_URL ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            ℹ️ Calendario todavía no configurado -- falta EXPO_PUBLIC_GOOGLE_CALENDAR_ID.
          </ThemedText>
        ) : null}

        {URL_CALENDARIO && (
          <GradientCard
            title="Abrir en Google Calendar"
            subtitle="Por si el calendario embebido no carga"
            boton="Abrir"
            onPress={() => Linking.openURL(URL_CALENDARIO)}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three },
  titulo: { fontSize: 26, lineHeight: 31 },
  sub: { marginTop: -Spacing.two },
  webview: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  aviso: { lineHeight: 20 },
});
