import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { obtenerEventosCalendario, type EventoCalendario } from '@/lib/api';
import { colorEvento } from '@/lib/calendario-colores';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function inicioMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}
function finMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59);
}
function isoFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function construirRejilla(mesRef: Date): Date[] {
  const primero = inicioMes(mesRef);
  const offset = (primero.getDay() + 6) % 7;
  const inicio = new Date(primero);
  inicio.setDate(inicio.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Miniatura del calendario general de la app (mismo color por estado -- verde
 * pagado, amarillo confirmado por Ariadna sin pagar, rojo solo solicitado, gris
 * entregado) para elegir un día tocándolo en vez de escribir la fecha a mano.
 * Ariadna, 2026-08-24: pedido explícito al editar una solicitud desde "Correo sin
 * resolver" -- quiere ver los demás trabajos ya agendados ese mes al decidir la
 * fecha nueva. */
export function SelectorFechaCalendario({
  fechaSeleccionada,
  onSeleccionar,
}: {
  fechaSeleccionada: string | null;
  onSeleccionar: (iso: string) => void;
}) {
  const theme = useTheme();
  const inicial = useMemo(() => {
    if (fechaSeleccionada) {
      const [y, m, d] = fechaSeleccionada.split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    }
    return new Date();
  }, [fechaSeleccionada]);
  const [mesRef, setMesRef] = useState(inicial);

  const desde = isoFecha(inicioMes(mesRef));
  const hasta = isoFecha(finMes(mesRef));
  const { data } = useQuery({ queryKey: ['calendario', desde, hasta], queryFn: () => obtenerEventosCalendario(desde, hasta) });

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoCalendario[]>();
    for (const ev of data?.eventos ?? []) {
      const clave = ev.inicio.slice(0, 10);
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(ev);
    }
    return mapa;
  }, [data]);

  const rejilla = useMemo(() => construirRejilla(mesRef), [mesRef]);
  const hoy = new Date();

  return (
    <View style={[styles.contenedor, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
      <View style={styles.cabecera}>
        <Pressable onPress={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} hitSlop={10}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</ThemedText>
        <Pressable onPress={() => setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} hitSlop={10}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.filaSemana}>
        {DIAS_SEMANA.map((d) => (
          <ThemedText key={d} type="small" themeColor="textSecondary" style={styles.celdaCabecera}>{d}</ThemedText>
        ))}
      </View>

      <View style={styles.rejilla}>
        {rejilla.map((dia) => {
          const delMes = dia.getMonth() === mesRef.getMonth();
          const esHoy = mismoDia(dia, hoy);
          const iso = isoFecha(dia);
          const esSeleccionado = fechaSeleccionada === iso;
          const eventosDia = eventosPorDia.get(iso) ?? [];
          return (
            <Pressable key={iso} onPress={() => onSeleccionar(iso)} style={styles.celdaDia}>
              <View
                style={[
                  styles.circuloNumero,
                  esHoy && { borderWidth: 1.5, borderColor: theme.accent },
                  esSeleccionado && { backgroundColor: theme.accent },
                ]}>
                <ThemedText
                  type="small"
                  style={[
                    styles.numeroDia,
                    !delMes && { opacity: 0.35 },
                    esSeleccionado && { color: '#fff', fontWeight: '800' },
                  ]}>
                  {dia.getDate()}
                </ThemedText>
              </View>
              <View style={styles.puntos}>
                {eventosDia.slice(0, 3).map((ev) => (
                  <View key={ev.id} style={[styles.punto, { backgroundColor: colorEvento(ev.color, theme.info) }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.leyenda}>
        <LeyendaItem color="#0b8043" texto="Pagado" />
        <LeyendaItem color="#f6c026" texto="Confirmado" />
        <LeyendaItem color="#d60000" texto="Solicitado" />
        <LeyendaItem color="#616161" texto="Entregado" />
      </View>
    </View>
  );
}

function LeyendaItem({ color, texto }: { color: string; texto: string }) {
  return (
    <View style={styles.leyendaItem}>
      <View style={[styles.leyendaPunto, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">{texto}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, marginTop: Spacing.two },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  filaSemana: { flexDirection: 'row' },
  celdaCabecera: { flex: 1, textAlign: 'center' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celdaDia: { width: `${100 / 7}%`, minHeight: 40, alignItems: 'center', paddingVertical: 2, gap: 2 },
  circuloNumero: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numeroDia: { fontSize: 13, textAlign: 'center' },
  puntos: { flexDirection: 'row', gap: 2, height: 6 },
  punto: { width: 5, height: 5, borderRadius: 3 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two, justifyContent: 'center' },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaPunto: { width: 8, height: 8, borderRadius: 4 },
});
