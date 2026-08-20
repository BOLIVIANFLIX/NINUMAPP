import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, obtenerResumen, type Resumen } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function InicioScreen() {
  const theme = useTheme();
  const { token, cerrarSesion } = useAuth();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setResumen(await obtenerResumen(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }, [token]);

  // useState con inicializador de función evitaría el warning de deps, pero aquí
  // basta con cargar una vez al montar -- pantalla única de momento.
  useState(() => {
    cargar();
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={theme.accent} />}>
          <ThemedView style={styles.cabecera}>
            <ThemedText type="subtitle" style={{ color: theme.accent }}>
              Inicio
            </ThemedText>
            <Pressable onPress={cerrarSesion}>
              <ThemedText type="link" themeColor="textSecondary">
                Cerrar sesión
              </ThemedText>
            </Pressable>
          </ThemedView>

          {resumen && (
            <ThemedText type="small" themeColor="textSecondary">
              Hola, {resumen.usuario}
            </ThemedText>
          )}

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {error}
            </ThemedText>
          )}

          {resumen && (
            <ThemedView type="backgroundElement" style={styles.tarjetas}>
              <Tarjeta titulo="Ingresos sin IVA (mes)" valor={eur.format(resumen.ingresos_sin_iva_mes)} />
              <Tarjeta titulo="Facturas pendientes de cobro" valor={String(resumen.facturas_pendientes_cobro)} />
              <Tarjeta titulo="Contactos sin resolver" valor={String(resumen.contactos_sin_resolver)} />
            </ThemedView>
          )}

          {resumen?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {resumen.aviso}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <ThemedView style={styles.tarjeta}>
      <ThemedText type="small" themeColor="textSecondary">
        {titulo}
      </ThemedText>
      <ThemedText type="subtitle">{valor}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tarjetas: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  tarjeta: { gap: Spacing.one },
  aviso: { lineHeight: 20 },
});
