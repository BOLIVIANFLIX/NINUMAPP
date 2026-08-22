import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AsuntoEmail, AsuntoPedidoWeb } from '@/components/avisos-pendientes';
import { GrandFoliesConfirmar } from '@/components/grand-folies-confirmar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { UsuariosPanel } from '@/components/usuarios-panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  obtenerAvisos,
  obtenerAvisosPendientes,
  obtenerGrandFoliesPendientes,
  type EncargoPendiente,
  type PedidoGrandFolies,
  type PedidoWebPendiente,
} from '@/lib/api';

type Vista = 'avisos' | 'usuarios';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Réplica de panel._seccion_avisos: seguridad, alarma de Casa (verde/rojo), "hoy
// toca preparar/entregar" destacado, Grand Folies detectados, correo sin resolver,
// pedidos web pendientes, preguntas de margen, Gestionar usuarios -- mismo orden.
export default function AvisosScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [pedidoGF, setPedidoGF] = useState<PedidoGrandFolies | null>(null);
  const [asuntoEmail, setAsuntoEmail] = useState<EncargoPendiente | null>(null);
  const [asuntoPedidoWeb, setAsuntoPedidoWeb] = useState<PedidoWebPendiente | null>(null);
  const [vista, setVista] = useState<Vista>('avisos');

  useFocusEffect(
    useCallback(() => {
      return () => {
        setVista('avisos');
        setPedidoGF(null);
        setAsuntoEmail(null);
        setAsuntoPedidoWeb(null);
      };
    }, []),
  );

  const avisos = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos, refetchInterval: 30_000 });
  const grandFolies = useQuery({ queryKey: ['avisos', 'grand-folies'], queryFn: obtenerGrandFoliesPendientes });
  const pendientesAgente = useQuery({ queryKey: ['avisos-pendientes'], queryFn: obtenerAvisosPendientes });

  if (asuntoEmail) return <AsuntoEmail encargo={asuntoEmail} onVolver={() => setAsuntoEmail(null)} />;
  if (asuntoPedidoWeb) return <AsuntoPedidoWeb pedido={asuntoPedidoWeb} onVolver={() => setAsuntoPedidoWeb(null)} />;

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

  const hoy = hoyISO();
  const entregasHoy = (grandFolies.data?.pedidos ?? []).filter((p) => p.fecha_entrega === hoy);
  const alarmaHA = avisos.data?.alarma_activa;
  const sinAlarma = !!alarmaHA && alarmaHA.toLowerCase().startsWith('ninguna');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.titulo}>
            Avisos
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitulo}>
            Contactos y preguntas pendientes
          </ThemedText>

          {!!pendientesAgente.data && pendientesAgente.data.intentos_fallidos_login >= 3 && (
            <>
              <SectionLabel>Seguridad</SectionLabel>
              <View style={[styles.avisoLinea, { backgroundColor: theme.dangerSoft }]}>
                <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>
                  ⚠️ {pendientesAgente.data.intentos_fallidos_login} intentos de inicio de sesión fallidos recientes -- si no
                  has sido tú, cambia tu contraseña.
                </ThemedText>
              </View>
            </>
          )}

          {alarmaHA != null && (
            <>
              <SectionLabel>Casa (Home Assistant)</SectionLabel>
              <View style={[styles.avisoLinea, { backgroundColor: sinAlarma ? theme.successSoft : theme.dangerSoft }]}>
                <ThemedText type="small" style={{ color: sinAlarma ? theme.success : theme.danger, fontWeight: '700' }}>
                  {sinAlarma ? '✅' : '⚠️'} {alarmaHA}
                </ThemedText>
              </View>
            </>
          )}

          {!!entregasHoy.length && (
            <>
              <SectionLabel>🔔 Hoy toca preparar/entregar</SectionLabel>
              <ListCard style={[styles.tarjetaDestacada, { borderColor: theme.accent }]}>
                {entregasHoy.map((p, i) => (
                  <ListRow
                    key={p.id}
                    last={i === entregasHoy.length - 1}
                    onPress={() => setPedidoGF(p)}
                    left={<NotifIcono icono="📄" color={theme.accent} bg={theme.accentSoft} />}
                    title={`Pedido Grand Folies${p.numero_pedido ? ` · ${p.numero_pedido}` : ''}`}
                    subtitle={`${p.lineas.length} línea(s) · entrega ${p.fecha_entrega ?? 'sin fecha'}${p.faltantes?.length ? ' · ⚠️ falta materia prima' : ''}`}
                  />
                ))}
              </ListCard>
            </>
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

          <SectionLabel>Correo sin resolver</SectionLabel>
          {pendientesAgente.data?.aviso && (
            <ThemedText type="small" themeColor="textSecondary">
              ℹ️ {pendientesAgente.data.aviso}
            </ThemedText>
          )}
          {pendientesAgente.data?.conectado && pendientesAgente.data.encargos.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Sin contactos de correo pendientes.
            </ThemedText>
          )}
          {!!pendientesAgente.data?.encargos.length && (
            <ListCard>
              {pendientesAgente.data.encargos.map((e, i) => (
                <ListRow
                  key={e.id}
                  last={i === pendientesAgente.data!.encargos.length - 1}
                  onPress={() => setAsuntoEmail(e)}
                  left={<NotifIcono icono={e.urgente ? '⚠️' : '✉️'} color={e.urgente ? theme.danger : theme.info} bg={e.urgente ? theme.dangerSoft : theme.infoSoft} />}
                  title={`${e.categoria} · ${e.cliente ?? 'sin nombre'}`}
                  subtitle={e.resumen}
                />
              ))}
            </ListCard>
          )}

          {!!pendientesAgente.data?.pedidos_web.length && (
            <>
              <SectionLabel>Pedidos de la web pendientes de revisar</SectionLabel>
              <ListCard>
                {pendientesAgente.data.pedidos_web.map((p, i) => (
                  <ListRow
                    key={p.locator}
                    last={i === pendientesAgente.data!.pedidos_web.length - 1}
                    onPress={() => setAsuntoPedidoWeb(p)}
                    left={<NotifIcono icono="🛍️" color={theme.success} bg={theme.successSoft} />}
                    title={`Pedido de la web · ${p.cliente ?? 'Cliente'}`}
                    subtitle={`${p.kind ?? ''} · pide para ${p.recogida_fecha ? new Date(p.recogida_fecha).toLocaleDateString('es-ES') : 'sin fecha'}`}
                  />
                ))}
              </ListCard>
            </>
          )}

          {!!pendientesAgente.data && pendientesAgente.data.preguntas_margen_pendientes > 0 && (
            <>
              <SectionLabel>Margen por calcular</SectionLabel>
              <ListCard style={styles.filaMargen}>
                <ListRow
                  last
                  left={<NotifIcono icono="❓" color={theme.warningText} bg={theme.warningSoft} />}
                  title={`${pendientesAgente.data.preguntas_margen_pendientes} pedido(s) esperando que indiques qué llevan`}
                  subtitle="Respóndelo por Telegram para calcular su margen"
                />
              </ListCard>
            </>
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
  titulo: { fontSize: 26, lineHeight: 31 },
  subtitulo: { marginBottom: Spacing.two },
  notifIco: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avisoLinea: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.two },
  tarjetaDestacada: { borderWidth: 1.5 },
  filaMargen: { paddingHorizontal: 4 },
  enlaceUsuarios: { marginTop: Spacing.four },
});
