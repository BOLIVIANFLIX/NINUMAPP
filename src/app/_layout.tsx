import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColaPendiente } from '@/hooks/use-cola-pendiente';
import { useRegistrarPush } from '@/hooks/use-registrar-push';
import { useTheme } from '@/hooks/use-theme';
import { iniciarDespachoAutomatico } from '@/lib/action-queue';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // 30s -- los datos del negocio no cambian tan rápido como para pedirlos en cada render
    },
  },
});

function AvisoColaPendiente() {
  const n = useColaPendiente();
  const theme = useTheme();
  if (n === 0) return null;
  return (
    <View style={{ backgroundColor: theme.accent, paddingVertical: Spacing.one, alignItems: 'center' }}>
      <ThemedText type="small" style={{ color: '#fff' }}>
        📡 {n} {n === 1 ? 'acción pendiente' : 'acciones pendientes'} de enviar -- se mandarán solas al volver la conexión
      </ThemedText>
    </View>
  );
}

function Contenido() {
  const { estado } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (estado !== 'cargando') SplashScreen.hideAsync();
  }, [estado]);

  // La cola solo tiene sentido con sesión iniciada (nada se encola antes de eso) --
  // se arranca aquí, no en AuthProvider, para no acoplar autenticación con la cola.
  useEffect(() => {
    if (estado === 'autenticado') return iniciarDespachoAutomatico();
  }, [estado]);

  useRegistrarPush(estado === 'autenticado');

  if (estado === 'cargando') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (estado !== 'autenticado') return <LoginScreen />;

  return (
    <View style={{ flex: 1 }}>
      <AvisoColaPendiente />
      <AppTabs />
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Contenido />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
