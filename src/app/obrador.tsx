import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InventarioAlbaran } from '@/components/inventario-albaran';
import { InventarioTicket } from '@/components/inventario-ticket';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Dot, ListCard, ListRow, SectionLabel, Segmented } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerAlarmas, obtenerRecetas, obtenerSensores, urlSnapshotCamara, type SensorHA } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Vista = 'obrador' | 'ticket' | 'albaran';
type Sub = 'Recetas' | 'Inventario';

export default function ObradorScreen() {
  const theme = useTheme();
  const [vista, setVista] = useState<Vista>('obrador');
  const [sub, setSub] = useState<Sub>('Recetas');

  const alarmas = useQuery({ queryKey: ['obrador', 'alarmas'], queryFn: obtenerAlarmas });
  const recetas = useQuery({ queryKey: ['obrador', 'recetas'], queryFn: obtenerRecetas });
  const sensores = useQuery({ queryKey: ['obrador', 'sensores'], queryFn: obtenerSensores, refetchInterval: 30_000 });

  if (vista === 'ticket') return <InventarioTicket onVolver={() => setVista('obrador')} />;
  if (vista === 'albaran') return <InventarioAlbaran onVolver={() => setVista('obrador')} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.titulo}>
            Obrador
          </ThemedText>

          <Segmented opciones={['Recetas', 'Inventario']} activo={sub} onCambiar={(v) => setSub(v as Sub)} />

          {sub === 'Recetas' ? (
            <>
              {sensores.data?.alarma_activa && (
                <View style={[styles.bannerAlarma, { backgroundColor: theme.dangerSoft }]}>
                  <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700' }}>
                    ⚠️ {sensores.data.alarma_activa}
                  </ThemedText>
                </View>
              )}

              <SectionLabel>Sensores</SectionLabel>
              {sensores.isLoading && <ActivityIndicator color={theme.accent} />}
              {sensores.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">
                  ℹ️ {sensores.data.aviso}
                </ThemedText>
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
                  <SectionLabel>Cámaras (foto actual)</SectionLabel>
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

              <SectionLabel>Alarmas de neveras</SectionLabel>
              {alarmas.isLoading && <ActivityIndicator color={theme.accent} />}
              {alarmas.error && (
                <ThemedText type="small" themeColor="danger">
                  {mensajeError(alarmas.error)}
                </ThemedText>
              )}
              {alarmas.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">
                  ℹ️ {alarmas.data.aviso}
                </ThemedText>
              )}
              {alarmas.data?.conectado && alarmas.data.alarmas.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Sin alarmas activas.
                </ThemedText>
              )}
              {!!alarmas.data?.alarmas.length && (
                <ListCard>
                  {alarmas.data.alarmas.map((a, i) => (
                    <ListRow
                      key={a.entity_id}
                      last={i === alarmas.data!.alarmas.length - 1}
                      left={<Dot color="warning" />}
                      title={a.nombre}
                      subtitle={a.ultima_vez ? `Última vez: ${fechaHora.format(new Date(a.ultima_vez))}` : 'Sin activaciones registradas'}
                    />
                  ))}
                </ListCard>
              )}

              <SectionLabel>Recetas</SectionLabel>
              {recetas.isLoading && <ActivityIndicator color={theme.accent} />}
              {recetas.error && (
                <ThemedText type="small" themeColor="danger">
                  {mensajeError(recetas.error)}
                </ThemedText>
              )}
              {recetas.data?.aviso && (
                <ThemedText type="small" themeColor="textSecondary">
                  ℹ️ {recetas.data.aviso}
                </ThemedText>
              )}
              {recetas.data?.conectado && recetas.data.recetas.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Grocy no tiene recetas todavía.
                </ThemedText>
              )}
              {!!recetas.data?.recetas.length && (
                <ListCard>
                  {recetas.data.recetas.map((r, i) => (
                    <ListRow key={r.id} last={i === recetas.data!.recetas.length - 1} left={<ThemedText style={{ fontSize: 18 }}>🥐</ThemedText>} title={r.nombre} subtitle={r.descripcion} />
                  ))}
                </ListCard>
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.notaCoste}>
                ℹ️ Coste real por hora: próximamente.
              </ThemedText>
            </>
          ) : (
            <>
              <SectionLabel>Escanear</SectionLabel>
              <ListCard>
                <ListRow
                  onPress={() => setVista('ticket')}
                  left={<AccionIcono icono="📷" />}
                  title="Escanear ticket de compra"
                  subtitle="Suma lo comprado al stock de Grocy."
                />
                <ListRow
                  last
                  onPress={() => setVista('albaran')}
                  left={<AccionIcono icono="📦" />}
                  title="Escanear mi albarán"
                  subtitle="Descuenta los ingredientes de las recetas entregadas."
                />
              </ListCard>
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
  notaCoste: { marginTop: Spacing.two, lineHeight: 18 },
  accionIcono: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bannerAlarma: { borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.three },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sensorCard: { flexGrow: 1, flexBasis: '47%', borderRadius: 16, padding: Spacing.three, gap: 2 },
  sensorValor: { fontSize: 22, lineHeight: 26 },
  camaraGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  camaraBox: { flexGrow: 1, flexBasis: '47%', gap: 4 },
  camaraImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
  camaraEtiqueta: { textAlign: 'center' },
});
