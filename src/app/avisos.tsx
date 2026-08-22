import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GrandFoliesConfirmar } from '@/components/grand-folies-confirmar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { UsuariosPanel } from '@/components/usuarios-panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerAvisos, obtenerCorreosPendientes, obtenerGrandFoliesPendientes, type PedidoGrandFolies } from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Vista = 'avisos' | 'usuarios';

export default function AvisosScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [pedidoGF, setPedidoGF] = useState<PedidoGrandFolies | null>(null);
  const [vista, setVista] = useState<Vista>('avisos');

  const solicitudes = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos, refetchInterval: 30_000 });
  const correos = useQuery({ queryKey: ['avisos', 'correos'], queryFn: obtenerCorreosPendientes });
  const grandFolies = useQuery({ queryKey: ['avisos', 'grand-folies'], queryFn: obtenerGrandFoliesPendientes });

  if (pedidoGF) {
    return (
      <GrandFoliesConfirmar
        pedido={pedidoGF}
        onVolver={() => setPedidoGF(null)}
        onResuelto={() => {
          setPedidoGF(null);
          queryClient.invalidateQueries({ queryKey: ['avisos', 'grand-folies'] });
        }}
      />
    );
  }

  if (vista === 'usuarios') return <UsuariosPanel onVolver={() => setVista('avisos')} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.titulo}>
            Avisos
          </ThemedText>

          {solicitudes.data?.alarma_activa && (
            <View style={[styles.bannerAlarma, { backgroundColor: theme.dangerSoft }]}>
              <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>
                ⚠️ {solicitudes.data.alarma_activa}
              </ThemedText>
            </View>
          )}

          {!!grandFolies.data?.pedidos.length && (
            <>
              <SectionLabel>Pedidos de Grand Folies detectados</SectionLabel>
              <ListCard>
                {grandFolies.data.pedidos.map((p, i) => (
                  <ListRow
                    key={p.id}
                    last={i === grandFolies.data!.pedidos.length - 1}
                    onPress={() => setPedidoGF(p)}
                    left={<NotifIcono icono="📄" color={theme.accent} bg={theme.accentSoft} />}
                    title={`Pedido Grand Folies${p.numero_pedido ? ` · ${p.numero_pedido}` : ''}`}
                    subtitle={`${p.lineas.length} línea(s) · entrega ${p.fecha_entrega ?? 'sin fecha'}${p.faltantes?.length ? ' · ⚠️ falta materia prima' : ''}`}
                  />
                ))}
              </ListCard>
            </>
          )}

          <SectionLabel>Solicitudes sin revisar</SectionLabel>
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
          {!!solicitudes.data?.solicitudes.length && (
            <ListCard>
              {solicitudes.data.solicitudes.map((s, i) => (
                <ListRow
                  key={s.id}
                  last={i === solicitudes.data!.solicitudes.length - 1}
                  left={<NotifIcono icono="🔔" color={theme.warning} bg={theme.warningSoft} />}
                  title={s.cliente}
                  subtitle={s.descripcion}
                  right={
                    <ThemedText type="small" themeColor="textSecondary">
                      {fecha.format(new Date(s.creado_en))}
                    </ThemedText>
                  }
                />
              ))}
            </ListCard>
          )}

          <SectionLabel>Correos sin leer</SectionLabel>
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
          {!!correos.data?.correos.length && (
            <ListCard>
              {correos.data.correos.map((c, i) => (
                <ListRow
                  key={c.id}
                  last={i === correos.data!.correos.length - 1}
                  left={<NotifIcono icono="✉️" color={theme.info} bg={theme.infoSoft} />}
                  title={c.de}
                  subtitle={`${c.asunto}\n${c.resumen}`}
                />
              ))}
            </ListCard>
          )}

          <Pressable onPress={() => setVista('usuarios')} style={styles.enlaceUsuarios}>
            <ThemedText type="link" style={{ color: theme.accent }}>
              👤 Gestionar usuarios ›
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function NotifIcono({ icono, color, bg }: { icono: string; color: string; bg: string }) {
  return (
    <View style={[styles.notifIco, { backgroundColor: bg }]}>
      <ThemedText style={{ fontSize: 14, color }}>{icono}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  titulo: { fontSize: 26, lineHeight: 31, marginBottom: Spacing.three },
  notifIco: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bannerAlarma: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.three },
  enlaceUsuarios: { marginTop: Spacing.four },
});
