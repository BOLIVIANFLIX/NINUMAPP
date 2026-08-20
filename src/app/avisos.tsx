import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerAvisos, obtenerCorreosPendientes, type CorreoPendiente, type SolicitudPendiente } from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AvisosScreen() {
  const theme = useTheme();

  const solicitudes = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos });
  const correos = useQuery({ queryKey: ['avisos', 'correos'], queryFn: obtenerCorreosPendientes });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="subtitle" style={{ color: theme.accent }}>
            Avisos
          </ThemedText>

          <Seccion titulo="Solicitudes sin revisar">
            {solicitudes.isLoading && <ActivityIndicator color={theme.accent} />}
            {solicitudes.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(solicitudes.error)}
              </ThemedText>
            )}
            {solicitudes.data?.aviso && (
              <ThemedText type="small" themeColor="textSecondary">
                ℹ️ {solicitudes.data.aviso}
              </ThemedText>
            )}
            {solicitudes.data?.conectado && solicitudes.data.solicitudes.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No hay solicitudes pendientes de revisar.
              </ThemedText>
            )}
            {solicitudes.data?.solicitudes.map((s) => <TarjetaSolicitud key={s.id} solicitud={s} />)}
          </Seccion>

          <Seccion titulo="Correos sin leer">
            {correos.isLoading && <ActivityIndicator color={theme.accent} />}
            {correos.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(correos.error)}
              </ThemedText>
            )}
            {correos.data?.aviso && (
              <ThemedText type="small" themeColor="textSecondary">
                ℹ️ {correos.data.aviso}
              </ThemedText>
            )}
            {correos.data?.conectado && correos.data.correos.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No hay correos sin leer.
              </ThemedText>
            )}
            {correos.data?.correos.map((c) => <TarjetaCorreo key={c.id} correo={c} />)}
          </Seccion>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.seccion}>
      <ThemedText type="default" style={styles.tituloSeccion}>
        {titulo}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

function TarjetaSolicitud({ solicitud }: { solicitud: SolicitudPendiente }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">🔔 {solicitud.cliente}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fecha.format(new Date(solicitud.creado_en))}
        </ThemedText>
      </ThemedView>
      {solicitud.descripcion && (
        <ThemedText type="small" themeColor="textSecondary">
          {solicitud.descripcion}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function TarjetaCorreo({ correo }: { correo: CorreoPendiente }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">✉️ {correo.de}</ThemedText>
      </ThemedView>
      <ThemedText type="small">{correo.asunto}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {correo.resumen}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  seccion: { gap: Spacing.two },
  tituloSeccion: { fontWeight: '600' },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  filaSuperior: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
