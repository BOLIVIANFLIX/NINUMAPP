/** Grocy (y las líneas leídas de un ticket/albarán escaneado) devuelven cantidades
 * con toda su precisión interna (p.ej. 2.456789) -- Ariadna, 2026-08-28: "en
 * inventario de la app los productos máximo un decimal". Redondea a 1 decimal y
 * quita los ceros sobrantes (2.5 se queda en 2.5, 5.0 se queda en 5) en vez de
 * forzar siempre una cifra decimal. */
export function unDecimalMaximo(n: number): number {
  return Math.round(n * 10) / 10;
}
