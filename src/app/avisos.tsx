import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AsuntoEmail, SolicitudDetalle } from '@/components/avisos-pendientes';
import { B2BCarritoConfirmar } from '@/components/b2b-carrito-confirmar';
import { GrandFoliesConfirmar } from '@/components/grand-folies-confirmar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  obtenerAvisos,
  obtenerAvisosPendientes,
  obtenerB2BCarritoPendientes,
  obtenerCorreosPendientes,
  obtenerGrandFoliesPendientes,
  type EncargoPendiente,
  type PedidoB2BCarrito,
  type PedidoGrandFolies,
  type SolicitudPendiente,
} from '@/lib/api';

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Réplica de panel._seccion_avisos: seguridad, alarma de Casa (verde/rojo), "hoy
// toca preparar/entregar" destacado, Grand Folies detectados, correo sin resolver,
// pedidos web pendientes, preguntas de margen -- mismo orden. "Gestionar usuarios"
// se quitó de aquí a petición de Ramiro (ya está en Inicio -> Gestión).
export default function AvisosScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [pedidoGF, setPedidoGF] = useState<PedidoGrandFolies | null>(null);
  const [pedidoB2B, setPedidoB2B] = useState<PedidoB2BCarrito | null>(null);
  const [asuntoEmail, setAsuntoEmail] = useState<EncargoPendiente | null>(null);
  const [solicitudAbierta, setSolicitudAbierta] = useState<SolicitudPendiente | null>(null);

  function volverAlPrincipal() {
    setPedidoGF(null);
    setPedidoB2B(null);
    setAsuntoEmail(null);
    setSolicitudAbierta(null);
  }

  useFocusEffect(useCallback(() => volverAlPrincipal, []));

  useEffect(() => {
    return navigation.addListener('tabPress' as never, volverAlPrincipal);
  }, [navigation]);

  const avisos = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos, refetchInterval: 30_000 });
  const grandFolies = useQuery({ queryKey: ['avisos', 'grand-folies'], queryFn: obtenerGrandFoliesPendientes });
  const b2bCarrito = useQuery({ queryKey: ['avisos', 'b2b-carrito'], queryFn: obtenerB2BCarritoPendientes });
  const pendientesAgente = useQuery({ queryKey: ['avisos-pendientes'], queryFn: obtenerAvisosPendientes });
  const correosGmail = useQuery({ queryKey: ['avisos', 'correos'], queryFn: obtenerCorreosPendientes, refetchInterval: 60_000 });
  const refrescandoTodo = useIsFetching() > 0;

  if (asuntoEmail) return <AsuntoEmail encargo={asuntoEmail} onVolver={() => setAsuntoEmail(null)} />;
  if (solicitudAbierta) return <SolicitudDetalle solicitud={solicitudAbierta} onVolver={() => setSolicitudAbierta(null)} />;

  if (pedidoGF) {
    return (
      <GrandFoliesConfirmar
        pedido={pedidoGF}
        onVolver={() => setPedidoGF(null)}
        onResuelto={() => {
          setPedidoGF(null);
          queryClient.invalidateQueries({ queryKey: ['avisos', 'grand-folies'] });
          // Confirmar genera un albarán real -- sin esto, Inicio se quedaba con las
          // cifras viejas hasta refrescarlo a mano (Ariadna, 2026-08-27).
          queryClient.invalidateQueries({ queryKey: ['resumen'] });
        }}
      />
    );
  }

  if (pedidoB2B) {
    return (
      <B2BCarritoConfirmar
        pedido={pedidoB2B}
        onVolver={() => setPedidoB2B(null)}
        onResuelto={() => {
          setPedidoB2B(null);
          queryClient.invalidateQueries({ queryKey: ['avisos', 'b2b-carrito'] });
          queryClient.invalidateQueries({ queryKey: ['resumen'] });
        }}
      />
    );
  }

  const hoy = hoyISO();
  const entregasHoy = (grandFolies.data?.pedidos ?? []).filter((p) => p.fecha_entrega === hoy);
  const alarmaHA = avisos.data?.alarma_activa;
  const sinAlarma = !!alarmaHA && alarmaHA.toLowerCase().startsWith('ninguna');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refrescandoTodo} onRefresh={() => queryClient.invalidateQueries()} tintColor={theme.accent} />}>
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

          {!!b2bCarrito.data?.pedidos.length && (
            <>
              <SectionLabel>Pedidos B2B del carrito privado</SectionLabel>
              <ListCard>
                {b2bCarrito.data.pedidos.map((p, i) => (
                  <ListRow
                    key={p.id}
                    last={i === b2bCarrito.data!.pedidos.length - 1}
                    onPress={() => setPedidoB2B(p)}
                    left={<NotifIcono icono="🏢" color={theme.accent} bg={theme.accentSoft} />}
                    title={`Pedido B2B · ${p.cliente}`}
                    subtitle={`${p.lineas.length} línea(s) · entrega ${p.fecha_entrega ?? 'sin fecha, pídesela tú'}${p.faltantes?.length ? ' · ⚠️ falta materia prima' : ''}`}
                  />
                ))}
              </ListCard>
            </>
          )}

          <SectionLabel>Pendientes de revisar</SectionLabel>
          {avisos.data?.aviso && (
            <ThemedText type="small" themeColor="textSecondary">
              ℹ️ {avisos.data.aviso}
            </ThemedText>
          )}
          {avisos.data?.conectado && avisos.data.solicitudes.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nada pendiente de revisar.
            </ThemedText>
          )}
          {!!avisos.data?.solicitudes.length && (
            <ListCard>
              {avisos.data.solicitudes.map((s, i) => (
                <ListRow
                  key={s.id}
                  last={i === avisos.data!.solicitudes.length - 1}
                  onPress={() => setSolicitudAbierta(s)}
                  left={<NotifIcono icono={s.kind === 'encargo' ? '✉️' : '🛍️'} color={theme.info} bg={theme.infoSoft} />}
                  title={s.cliente}
                  subtitle={s.descripcion || (s.kind === 'tienda' ? 'Pedido de la tienda' : s.kind === 'edicion' ? 'Edición especial' : s.kind)}
                />
              ))}
            </ListCard>
          )}

          {/* Respaldo local -- solo aparece si alguna vez falla la llamada a la web al
              detectar el correo (ver main.py::procesar_mensajes_nuevos en ninuma-agente);
              en el camino normal esta lista está vacía porque el pedido ya quedó arriba. */}
          {!!pendientesAgente.data?.encargos.length && (
            <>
              <SectionLabel>Sin conexión con la web (respaldo local)</SectionLabel>
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
            </>
          )}

          {/* Bandeja de Gmail en crudo (cualquier correo sin leer, lo haya clasificado o
              no ninuma-agente) -- Ariadna, 2026-08-24: contaba en el número de avisos
              pero no se veía en ningún sitio de la app, así que un correo sin
              clasificar quedaba "contado pero invisible". */}
          {!!correosGmail.data?.correos.length && (
            <>
              <SectionLabel>Correos sin leer</SectionLabel>
              <ListCard>
                {correosGmail.data.correos.map((c, i) => (
                  <ListRow
                    key={c.id}
                    last={i === correosGmail.data!.correos.length - 1}
                    left={<NotifIcono icono="📧" color={theme.info} bg={theme.infoSoft} />}
                    title={c.asunto || '(sin asunto)'}
                    subtitle={`${c.de}${c.resumen ? ` · ${c.resumen}` : ''}`}
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
