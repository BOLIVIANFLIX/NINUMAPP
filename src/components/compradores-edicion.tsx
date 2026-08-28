import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, Pill, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerCompradoresEdicion, urlPedidoQr, type CompradorEdicion } from '@/lib/api';
import { descargarYCompartir } from '@/lib/descargas';
import { tokenStore } from '@/lib/token-store';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

/** Réplica de nada del bot -- pantalla nueva, Ariadna 2026-08-25: "necesito un
 * apartado donde ver el listado de la gente que se ha apuntado a la cena... y lo
 * mismo para productos de ediciones... poder acceder a su QR y código, para poder
 * imprimirlo si lo necesito". Un solo listado para cualquier pedido kind='edicion'
 * (cena o producto) -- se agrupa por edición cuando hay más de una en el
 * histórico, la más reciente primero. */
export function CompradoresEdicion({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [abierto, setAbierto] = useState<CompradorEdicion | null>(null);
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['compradores-edicion'], queryFn: obtenerCompradoresEdicion });

  if (abierto) return <DetalleComprador comprador={abierto} onVolver={() => setAbierto(null)} />;

  const grupos = new Map<string, CompradorEdicion[]>();
  for (const c of data?.compradores ?? []) {
    const clave = c.edicion_slug ?? '(sin edición identificada)';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(c);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Pedidos</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>Compradores de Ediciones</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitulo}>
            Cenas reservadas y productos de edición vendidos, con acceso a su código/QR.
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}
          {data?.conectado && data.compradores.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">Todavía no hay compradores.</ThemedText>
          )}

          {[...grupos.entries()].map(([slug, compradores]) => (
            <View key={slug}>
              <SectionLabel>{slug === '(sin edición identificada)' ? slug : slug.replace(/-/g, ' ')}</SectionLabel>
              <ListCard>
                {compradores.map((c, i) => (
                  <ListRow
                    key={c.id}
                    last={i === compradores.length - 1}
                    onPress={c.locator ? () => setAbierto(c) : undefined}
                    left={
                      <Pill color={c.es_cena ? 'accent' : 'info'}>{c.es_cena ? 'Cena' : 'Producto'}</Pill>
                    }
                    title={c.cliente}
                    subtitle={`${c.lineas.map((l) => `${l.unidades}× ${l.nombre}`).join(', ')}${c.es_cena ? (c.checked_in_at ? ' · ✅ entrada validada' : ' · entrada sin validar') : ''}`}
                    right={
                      <View style={styles.right}>
                        <ThemedText type="smallBold">{eur.format(c.total_cents / 100)}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {fecha.format(new Date(c.recogida_fecha ?? c.creado_en))}
                        </ThemedText>
                      </View>
                    }
                  />
                ))}
              </ListCard>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DetalleComprador({ comprador, onVolver }: { comprador: CompradorEdicion; onVolver: () => void }) {
  const theme = useTheme();
  const [compartiendo, setCompartiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = tokenStore.getAccessToken();
  const qrUrl = urlPedidoQr(comprador.id);

  async function compartirQr() {
    setCompartiendo(true);
    setError(null);
    try {
      await descargarYCompartir(qrUrl, `entrada-${comprador.locator ?? comprador.id}.png`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">← Compradores de Ediciones</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>{comprador.cliente}</ThemedText>

          <View style={styles.centroQr}>
            <Image
              source={{ uri: qrUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
              style={styles.qrImagen}
              resizeMode="contain"
            />
          </View>

          <ThemedText type="default" style={styles.locatorTexto}>{comprador.locator}</ThemedText>
          {comprador.guest_telefono && <ThemedText type="small" themeColor="textSecondary">{comprador.guest_telefono}</ThemedText>}
          {comprador.es_cena && (
            <ThemedText type="small" themeColor={comprador.checked_in_at ? 'success' : 'textSecondary'} style={styles.estado}>
              {comprador.checked_in_at ? '✅ Entrada ya validada en la puerta' : 'Entrada todavía sin validar'}
            </ThemedText>
          )}

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="🖨️ Compartir / Imprimir QR" onPress={compartirQr} cargando={compartiendo} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  subtitulo: { marginBottom: Spacing.two },
  centro: { marginTop: Spacing.four },
  right: { alignItems: 'flex-end', gap: 2 },
  centroQr: { alignItems: 'center', marginTop: Spacing.three },
  qrImagen: { width: 260, height: 260 },
  locatorTexto: { textAlign: 'center', marginTop: Spacing.two, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  estado: { textAlign: 'center', marginTop: Spacing.one },
  error: { marginTop: Spacing.two, textAlign: 'center' },
  botonWrap: { marginTop: Spacing.three },
});
