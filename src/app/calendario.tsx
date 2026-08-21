import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientCard } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';

// v1 sencilla: enlace directo a Google Calendar (se abre en la app/navegador de
// verdad). Un calendario embebido en vivo exigiría hacerlo público u OAuth -- se deja
// para una fase posterior si hace falta.
const URL_CALENDARIO = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_URL;

export default function CalendarioScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.titulo}>
          Calendario
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
          Entregas, eventos y encargos, todo en un sitio
        </ThemedText>

        {URL_CALENDARIO ? (
          <GradientCard title="Abrir Google Calendar" subtitle="Tu calendario de NINUMÁ, completo" boton="Abrir" onPress={() => Linking.openURL(URL_CALENDARIO)} />
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
  safeArea: { flex: 1, padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  titulo: { fontSize: 26, lineHeight: 31 },
  sub: { marginTop: 2, marginBottom: Spacing.four },
  aviso: { lineHeight: 20 },
});
