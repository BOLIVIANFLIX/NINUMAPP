import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientCard, ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import { mensajeError, obtenerEventosCalendario, type EventoCalendario } from '@/lib/api';
import { colorEvento } from '@/lib/calendario-colores';

const URL_CALENDARIO = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_URL;

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Máximo de etiquetas de evento visibles dentro de una casilla del día antes de
// resumir el resto en "+N" -- estilo Google Calendar (ver captura de referencia de
// Ariadna), en vez de un simple punto + lista al tocar.
const MAX_ETIQUETAS_POR_DIA = 2;

function inicioMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59);
}

// OJO: nunca usar fecha.toISOString() aquí -- convierte a UTC y, en Madrid
// (adelantada respecto a UTC), la medianoche local de un día cae en la tarde/noche
// UTC del día ANTERIOR. Eso desplazaba los eventos un día en la rejilla y, al
// construir desde/hasta para la consulta, podía dejar fuera el borde del mes
// (bug real: Ariadna, 2026-08-25 -- "veo los eventos todos un día después" y
// pedidos de tienda que ni aparecían). Se usan los componentes de fecha LOCAL,
// igual que ya hace mismoDia() más abajo.
function isoFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const refrescandoTodo = useIsFetching() > 0;
  const [mesRef, setMesRef] = useState(() => new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null);

  function volverAlMesActual() {
    setMesRef(new Date());
    setDiaSeleccionado(null);
  }

  // Al salir del calendario (u de la app) siempre vuelve al mes actual al reabrir --
  // antes se quedaba "congelado" en el mes al que se había navegado (bug real:
  // Ariadna, 2026-08-23). Botón/gesto de "atrás" de Android: si hay un día
  // seleccionado, lo deselecciona primero; si no, vuelve al mes actual.
  useFocusEffect(useCallback(() => volverAlMesActual, []));
  useEffect(() => {
    return navigation.addListener('tabPress' as never, volverAlMesActual);
  }, [navigation]);
  useVolverAtras(!diaSeleccionado && mesRef.getMonth() === new Date().getMonth() && mesRef.getFullYear() === new Date().getFullYear(), () => {
    if (diaSeleccionado) return setDiaSeleccionado(null);
    volverAlMesActual();
  });

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
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refrescandoTodo} onRefresh={() => queryClient.invalidateQueries()} tintColor={theme.accent} />}>
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
              const eventosDia = eventosPorDia.get(isoFecha(dia)) ?? [];
              const visibles = eventosDia.slice(0, MAX_ETIQUETAS_POR_DIA);
              const restantes = eventosDia.length - visibles.length;
              return (
                <Pressable
                  key={dia.toISOString()}
                  onPress={() => setDiaSeleccionado(dia)}
                  style={[
                    styles.celdaDia,
                    { borderColor: theme.separator },
                    esSeleccionado && { backgroundColor: theme.accentSoft },
                  ]}>
                  <View style={[styles.circuloNumero, esHoy && { backgroundColor: theme.accent }]}>
                    <ThemedText
                      type="small"
                      style={[
                        styles.numeroDia,
                        !delMes && { color: theme.textSecondary, opacity: 0.4 },
                        esHoy && { color: '#fff', fontWeight: '800' },
                      ]}>
                      {dia.getDate()}
                    </ThemedText>
                  </View>
                  <View style={styles.etiquetasDia}>
                    {visibles.map((ev) => (
                      <View key={ev.id} style={[styles.etiquetaEvento, { backgroundColor: colorEvento(ev.color, theme.info) }]}>
                        <ThemedText numberOfLines={1} style={styles.etiquetaTexto}>
                          {ev.todo_el_dia ? ev.titulo : ev.titulo}
                        </ThemedText>
                      </View>
                    ))}
                    {restantes > 0 && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.masEventos}>
                        +{restantes} más
                      </ThemedText>
                    )}
                  </View>
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
  celdaDia: { width: `${100 / 7}%`, minHeight: 88, paddingVertical: 3, paddingHorizontal: 2, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  circuloNumero: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  numeroDia: { fontSize: 14, textAlign: 'center' },
  etiquetasDia: { gap: 2 },
  etiquetaEvento: { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2 },
  etiquetaTexto: { fontSize: 12, lineHeight: 15, color: '#fff', fontWeight: '600' },
  masEventos: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  tarjetaExterna: { marginTop: Spacing.four },
});
