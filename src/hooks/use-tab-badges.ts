import { useQuery } from '@tanstack/react-query';

import { obtenerAlarmasNoVistas, obtenerAvisos, obtenerCorreosPendientes } from '@/lib/api';

/** Nº para los badges de las pestañas -- Obrador cuenta alarmas de Home Assistant no
 * vistas todavía (mismo criterio "visto" que la lista "Alarmas recientes" de esa
 * misma pantalla -- antes venían de una consulta en vivo distinta, que no coincidía
 * con lo que se veía al entrar y dejaba avisos "fantasma", ver fix 2026-08-22).
 * Avisos cuenta solicitudes de encargo sin revisar + correos sin leer. Comparte
 * caché con las pantallas reales (misma queryKey) -- no dispara peticiones extra. */
export function useTabBadges() {
  const alarmas = useQuery({ queryKey: ['obrador', 'alarmas-no-vistas'], queryFn: obtenerAlarmasNoVistas });
  const avisos = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos });
  const correos = useQuery({ queryKey: ['avisos', 'correos'], queryFn: obtenerCorreosPendientes });

  return { obrador: alarmas.data ?? 0, avisos: (avisos.data?.solicitudes.length ?? 0) + (correos.data?.correos.length ?? 0) };
}
