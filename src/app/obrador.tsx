import { useQuery } from '@tanstack/react-query';
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
import { mensajeError, obtenerAlarmas, obtenerRecetas } from '@/lib/api';

const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Vista = 'obrador' | 'ticket' | 'albaran';
type Sub = 'Recetas' | 'Inventario';

export default function ObradorScreen() {
  const theme = useTheme();
  const [vista, setVista] = useState<Vista>('obrador');
  const [sub, setSub] = useState<Sub>('Recetas');

  const alarmas = useQuery({ queryKey: ['obrador', 'alarmas'], queryFn: obtenerAlarmas });
  const recetas = useQuery({ queryKey: ['obrador', 'recetas'], queryFn: obtenerRecetas });

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
});
