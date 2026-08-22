import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientCard, ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerEventosCalendario, type EventoCalendario } from '@/lib/api';

const URL_CALENDARIO = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_URL;

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function inicioMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59);
}

function isoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Rejilla de 6 semanas (lunes a domingo) cubriendo el mes, con relleno del mes
 * anterior/siguiente para completar la primera y última semana. */
function construirRejilla(mesRef: Date): Date[] {
  const primero = inicioMes(mesRef);
  const offset = (primero.getDay() + 6) % 7; // lunes=0
  const inicio = new Date(primero);
  inicio.setDate(inicio.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarioScreen() {
  const theme = useTheme();
  const [mesRef, setMesRef] = useState(() => new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null);

  const desde = isoFecha(inicioMes(mesRef));
  const hasta = isoFecha(finMes(mesRef));
  const { data, error, isFetching } = useQuery({
    queryKey: ['calendario', desde, hasta],
    queryFn: () => obtenerEventosCalendario(desde, hasta),
  });

  const rejilla = useMemo(() => construirRejilla(mesRef), [mesRef]);
  const hoy = new Date();

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoCalendario[]>();
    for (const ev of data?.eventos ?? []) {
      const clave = ev.inicio.slice(0, 10);
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(ev);
    }
    return mapa;
  }, [data]);

  const eventosDelDiaSeleccionado = diaSeleccionado ? (eventosPorDia.get(isoFecha(diaSeleccionado)) ?? []) : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.titulo}>
            Calendario
          </ThemedText>

          <View style={styles.cabeceraMes}>
            <Pressable onPress={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} hitSlop={10}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                ‹
              </ThemedText>
            </Pressable>
            <ThemedText type="smallBold">
              {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
            </ThemedText>
            <Pressable onPress={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} hitSlop={10}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                ›
              </ThemedText>
            </Pressable>
          </View>

          {isFetching && <ActivityIndicator color={theme.accent} style={styles.cargando} />}
          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {mensajeError(error)}
            </ThemedText>
          )}
          {data?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {data.aviso}
            </ThemedText>
          )}

          <View style={styles.filaSemana}>
            {DIAS_SEMANA.map((d) => (
              <ThemedText key={d} type="small" themeColor="textSecondary" style={styles.celdaCabecera}>
                {d}
              </ThemedText>
            ))}
          </View>

          <View style={styles.rejilla}>
            {rejilla.map((dia) => {
              const delMes = dia.getMonth() === mesRef.getMonth();
              const esHoy = mismoDia(dia, hoy);
              const esSeleccionado = diaSeleccionado && mismoDia(dia, diaSeleccionado);
              const nEventos = eventosPorDia.get(isoFecha(dia))?.length ?? 0;
              return (
                <Pressable key={dia.toISOString()} onPress={() => setDiaSeleccionado(dia)} style={styles.celdaDia}>
                  <View style={[styles.circuloDia, esSeleccionado && { backgroundColor: theme.accent }, !esSeleccionado && esHoy && { backgroundColor: theme.accentSoft }]}>
                    <ThemedText
                      type="small"
                      style={[!delMes && { color: theme.textSecondary, opacity: 0.4 }, esSeleccionado && { color: '#fff' }, esHoy && !esSeleccionado && { color: theme.accent, fontWeight: '700' }]}>
                      {dia.getDate()}
                    </ThemedText>
                  </View>
                  {nEventos > 0 && <View style={[styles.puntoEvento, { backgroundColor: esSeleccionado ? theme.accent : theme.info }]} />}
                </Pressable>
              );
            })}
          </View>

          {diaSeleccionado && (
            <>
              <SectionLabel>{`${diaSeleccionado.getDate()} de ${MESES[diaSeleccionado.getMonth()]}`}</SectionLabel>
              {eventosDelDiaSeleccionado.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sin eventos ese día.
                </ThemedText>
              ) : (
                <ListCard>
                  {eventosDelDiaSeleccionado.map((ev, i) => (
                    <ListRow
                      key={ev.id}
                      last={i === eventosDelDiaSeleccionado.length - 1}
                      title={ev.titulo}
                      subtitle={ev.todo_el_dia ? 'Todo el día' : fechaCorta.format(new Date(ev.inicio))}
                    />
                  ))}
                </ListCard>
              )}
            </>
          )}

          {URL_CALENDARIO && (
            <View style={styles.tarjetaExterna}>
              <GradientCard title="Abrir en Google Calendar" subtitle="Vista completa fuera de la app" boton="Abrir" onPress={() => Linking.openURL(URL_CALENDARIO)} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  titulo: { fontSize: 26, lineHeight: 31, marginBottom: Spacing.three },
  cabeceraMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  cargando: { marginBottom: Spacing.two },
  aviso: { lineHeight: 20, marginBottom: Spacing.two },
  filaSemana: { flexDirection: 'row' },
  celdaCabecera: { flex: 1, textAlign: 'center' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celdaDia: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, gap: 2 },
  circuloDia: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  puntoEvento: { width: 5, height: 5, borderRadius: 3 },
  tarjetaExterna: { marginTop: Spacing.four },
});
