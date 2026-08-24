/** Paleta fija de colorId de Google Calendar -- ver WBD/src/lib/google-calendar.ts
 * (colorEvento): 10 Basil/verde = pagado, 5 Banana/amarillo = confirmada por
 * Ariadna sin pagar, 11 Tomato/rojo = solicitud del cliente sin revisar, 8
 * Graphite/gris = entregado. El resto de colorId (1-9) son los que Google define
 * para eventos coloreados a mano desde fuera de la app -- se incluyen todos para no
 * dejar ningún evento sin color por no reconocer su colorId.
 *
 * Ariadna, 2026-08-24: el calendario nunca pintaba estos colores -- el backend pasa
 * el colorId de Google tal cual ("10", "5"...), que no es un color válido para
 * React Native (necesita un hex). Faltaba esta traducción. */
export const COLOR_POR_ID: Record<string, string> = {
  '1': '#7986cb', // Lavender
  '2': '#33b679', // Sage
  '3': '#8e24aa', // Grape
  '4': '#e67c73', // Flamingo
  '5': '#f6c026', // Banana -- confirmada por Ariadna, sin pagar
  '6': '#f5511d', // Tangerine
  '7': '#039be5', // Peacock
  '8': '#616161', // Graphite -- entregado
  '9': '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil -- pagado
  '11': '#d60000', // Tomato -- solicitud del cliente, sin revisar
};

export function colorEvento(colorId: string | null | undefined, colorPorDefecto: string): string {
  if (!colorId) return colorPorDefecto;
  return COLOR_POR_ID[colorId] ?? colorPorDefecto;
}
