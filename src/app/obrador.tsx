import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InventarioEscaner } from '@/components/inventario-escaner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha, ListCard, ListRow, SectionLabel, Segmented } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import {
  marcarAlarmasVistas,
  obtenerAlarmasRecientes,
  obtenerMovimientosInventario,
  obtenerSensores,
  obtenerStockActual,
  urlSnapshotCamara,
  type SensorHA,
} from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Vista = 'obrador' | 'escanear';
type Sub = 'Sensores' | 'Inventario';

export default function ObradorScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>('obrador');
  const [sub, setSub] = useState<Sub>('Sensores');

  function volverAlPrincipal() {
    setVista('obrador');
    setSub('Sensores');
  }

  // Botón/gesto de "atrás" de Android -- vuelve a la pantalla principal de Obrador
  // en vez de salir de la app (bug real: Ariadna, 2026-08-23).
  useVolverAtras(vista === 'obrador', volverAlPrincipal);

  // Al entrar en Obrador se marcan como vistas las alarmas de HA pendientes -- el
  // badge de la barra inferior se limpia, "Alarmas recientes" se queda igual (son
  // dos cosas distintas, ver hooks/use-tab-badges.ts).
  useFocusEffect(
    useCallback(() => {
      marcarAlarmasVistas()
        .then(() => queryClient.invalidateQueries({ queryKey: ['obrador', 'alarmas-no-vistas'] }))
        .catch(() => {});
      return volverAlPrincipal;
    }, [queryClient]),
  );

  useEffect(() => {
    return navigation.addListener('tabPress' as never, volverAlPrincipal);
  }, [navigation]);

  const recientes = useQuery({ queryKey: ['obrador', 'alarmas-recientes'], queryFn: obtenerAlarmasRecientes });
  const sensores = useQuery({ queryKey: ['obrador', 'sensores'], queryFn: obtenerSensores, refetchInterval: 30_000 });
  const stock = useQuery({ queryKey: ['obrador', 'stock-actual'], queryFn: obtenerStockActual, enabled: sub === 'Inventario' });
  const movimientos = useQuery({ queryKey: ['obrador', 'movimientos'], queryFn: obtenerMovimientosInventario, enabled: sub === 'Inventario' });

  if (vista === 'escanear') return <InventarioEscaner onVolver={() => setVista('obrador')} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.titulo}>
            Obrador
          </ThemedText>

          <Segmented opciones={['Sensores', 'Inventario']} activo={sub} onCambiar={(v) => setSub(v as Sub)} />

          {sub === 'Sensores' ? (
            <>
              {/* Registro permanente de las últimas alarmas (vistas o no) -- distinto
                  del banner de abajo, que es el estado ACTUAL agregado. */}
              {!!recientes.data?.recientes.length && (
                <>
                  <SectionLabel>Alarmas recientes</SectionLabel>
                  <Ficha style={styles.fichaAlarmas}>
                    {recientes.data.recientes.map((a, i) => (
                      <FilaFicha
                        key={`${a.disparado_en}-${i}`}
                        etiqueta={a.texto}
                        valor={fechaHora.format(new Date(a.disparado_en))}
                        last={i === recientes.data!.recientes.length - 1}
                      />
                    ))}
                  </Ficha>
                </>
              )}
              {recientes.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.avisoTexto}>
                  ℹ️ {recientes.data.aviso}
                </ThemedText>
              )}

              {sensores.data?.alarma_activa != null &&
                (sensores.data.alarma_activa.toLowerCase().startsWith('ninguna') ? (
                  <View style={[styles.bannerAlarma, { backgroundColor: theme.successSoft }]}>
                    <ThemedText type="small" style={{ color: theme.success, fontWeight: '700' }}>
                      ✅ {sensores.data.alarma_activa}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.bannerAlarma, { backgroundColor: theme.dangerSoft }]}>
                    <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>
                      ⚠️ {sensores.data.alarma_activa}
                    </ThemedText>
                  </View>
                ))}

              <SectionLabel>Sensores</SectionLabel>
              {sensores.isLoading && <ActivityIndicator color={theme.accent} />}
              {sensores.data?.aviso && (
                <>
                  <View style={[styles.avisoHA, { backgroundColor: theme.warningSoft }]}>
                    <ThemedText type="small" style={{ color: theme.warningText, lineHeight: 19 }}>
                      Todavía no puedo leer temperaturas de neveras ni consumo eléctrico aquí -- hace falta que generes un{' '}
                      <ThemedText type="smallBold" style={{ color: theme.warningText }}>
                        Long-Lived Access Token
                      </ThemedText>{' '}
                      desde tu perfil de Home Assistant (Perfil → Seguridad → Tokens de acceso de larga duración) y me lo
                      pases para configurarlo. Mientras tanto, ábrelo directamente en Home Assistant:
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => Linking.openURL('https://ha.tunga.es')} style={[styles.tarjetaHA, { backgroundColor: theme.backgroundElement }]}>
                    <View>
                      <ThemedText type="smallBold">Abrir Home Assistant</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Neveras, consumo eléctrico y todo lo demás
                      </ThemedText>
                    </View>
                    <View style={[styles.botonHA, { backgroundColor: theme.accentSoft }]}>
                      <ThemedText type="smallBold" style={{ color: theme.accent }}>
                        Abrir ↗
                      </ThemedText>
                    </View>
                  </Pressable>
                </>
              )}
              {!!sensores.data?.sensores.length && (
                <View style={styles.sensorGrid}>
                  {sensores.data.sensores.map((s) => (
                    <SensorCard key={s.entity_id} sensor={s} />
                  ))}
                </View>
              )}

              {!!sensores.data?.camaras.length && (
                <>
                  <SectionLabel>Cámaras (foto actual, se actualiza al abrir)</SectionLabel>
                  <View style={styles.camaraGrid}>
                    {sensores.data.camaras.map((c) => (
                      <View key={c.entity_id} style={styles.camaraBox}>
                        <Image
                          source={{ uri: urlSnapshotCamara(c.entity_id), headers: { Authorization: `Bearer ${tokenStore.getAccessToken() ?? ''}` } }}
                          style={[styles.camaraImg, { backgroundColor: theme.backgroundSelected }]}
                          contentFit="cover"
                          transition={150}
                        />
                        <ThemedText type="small" themeColor="textSecondary" style={styles.camaraEtiqueta}>
                          {c.etiqueta}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <ListCard>
                <ListRow
                  last
                  onPress={() => setVista('escanear')}
                  left={<AccionIcono icono="📷" />}
                  title="Escanear"
                  subtitle="Ticket de compra o tu propio albarán -- lo distingo yo solo."
                />
              </ListCard>

              <SectionLabel>Inventario actual (Grocy)</SectionLabel>
              {stock.isLoading && <ActivityIndicator color={theme.accent} />}
              {stock.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">ℹ️ {stock.data.aviso}</ThemedText>
              )}
              {stock.data?.conectado && stock.data.stock.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">Sin stock registrado en Grocy.</ThemedText>
              )}
              {!!stock.data?.stock.length && (
                <ListCard>
                  {stock.data.stock.map((s, i) => (
                    <ListRow
                      key={s.producto}
                      last={i === stock.data!.stock.length - 1}
                      title={s.producto}
                      right={<ThemedText type="smallBold">{s.cantidad}</ThemedText>}
                    />
                  ))}
                </ListCard>
              )}

              <SectionLabel>Últimos movimientos</SectionLabel>
              {movimientos.isLoading && <ActivityIndicator color={theme.accent} />}
              {movimientos.data?.conectado && movimientos.data.movimientos.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">Todavía no se ha confirmado ningún escaneo.</ThemedText>
              )}
              {!!movimientos.data?.movimientos.length && (
                <ListCard>
                  {movimientos.data.movimientos.map((m, i) => (
                    <ListRow
                      key={m.id}
                      last={i === movimientos.data!.movimientos.length - 1}
                      title={m.descripcion}
                      subtitle={fechaHora.format(new Date(m.creado_en))}
                    />
                  ))}
                </ListCard>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SensorCard({ sensor }: { sensor: SensorHA }) {
  const theme = useTheme();
  return (
    <View style={[styles.sensorCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="subtitle" style={styles.sensorValor}>
        {sensor.valor !== null ? `${sensor.valor}${sensor.unidad ?? ''}` : 'sin datos'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {sensor.etiqueta}
      </ThemedText>
    </View>
  );
}

function AccionIcono({ icono }: { icono: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.accionIcono, { backgroundColor: theme.accentSoft }]}>
      <ThemedText style={{ fontSize: 16 }}>{icono}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  titulo: { fontSize: 26, lineHeight: 31, marginBottom: Spacing.three },
  accionIcono: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bannerAlarma: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.three },
  fichaAlarmas: { marginBottom: Spacing.three },
  avisoTexto: { marginBottom: Spacing.three, lineHeight: 18 },
  avisoHA: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.two },
  tarjetaHA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.three, gap: Spacing.two },
  botonHA: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sensorCard: { flexGrow: 1, flexBasis: '47%', borderRadius: 16, padding: Spacing.three, gap: 2 },
  sensorValor: { fontSize: 22, lineHeight: 26 },
  camaraGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  camaraBox: { flexGrow: 1, flexBasis: '47%', gap: 4 },
  camaraImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
  camaraEtiqueta: { textAlign: 'center' },
});
