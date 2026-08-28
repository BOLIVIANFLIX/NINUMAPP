/** Rejilla de mes (6 semanas, lunes a domingo) y utilidades de fecha compartidas por
 * el calendario general (app/calendario.tsx) y el selector en miniatura embebido al
 * editar una solicitud (components/selector-fecha-calendario.tsx) -- vivían
 * duplicadas byte a byte en los dos archivos; revisión de calidad de código,
 * 2026-08-27. */

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function inicioMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

export function finMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59);
}

// OJO: nunca usar fecha.toISOString() aquí -- convierte a UTC y, en Madrid
// (adelantada respecto a UTC), la medianoche local de un día cae en la tarde/noche
// UTC del día ANTERIOR. Eso desplazaba los eventos un día en la rejilla y, al
// construir desde/hasta para la consulta, podía dejar fuera el borde del mes
// (bug real: Ariadna, 2026-08-25 -- "veo los eventos todos un día después" y
// pedidos de tienda que ni aparecían). Se usan los componentes de fecha LOCAL,
// igual que ya hace mismoDia() más abajo.
export function isoFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Rejilla de 6 semanas (lunes a domingo) cubriendo el mes, con relleno del mes
 * anterior/siguiente para completar la primera y última semana. */
export function construirRejilla(mesRef: Date): Date[] {
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
