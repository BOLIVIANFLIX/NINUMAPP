import { useQuery } from '@tanstack/react-query';

import { obtenerAlarmas, obtenerAvisos, obtenerCorreosPendientes } from '@/lib/api';

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

/** Nº para los badges de las pestañas -- Obrador cuenta alarmas activadas en las
 * últimas 24h (no todas las que existen, o el badge nunca bajaría de 12), Avisos
 * cuenta solicitudes de encargo sin revisar + correos sin leer. Comparte caché con
 * las pantallas reales (misma queryKey) -- no dispara peticiones extra. */
export function useTabBadges() {
  const alarmas = useQuery({ queryKey: ['obrador', 'alarmas'], queryFn: obtenerAlarmas });
  const avisos = useQuery({ queryKey: ['avisos'], queryFn: obtenerAvisos });
  const correos = useQuery({ queryKey: ['avisos', 'correos'], queryFn: obtenerCorreosPendientes });

  const ahora = Date.now();
  const obrador = (alarmas.data?.alarmas ?? []).filter(
    (a) => a.ultima_vez && ahora - new Date(a.ultima_vez).getTime() < VEINTICUATRO_HORAS_MS,
  ).length;

  return { obrador, avisos: (avisos.data?.solicitudes.length ?? 0) + (correos.data?.correos.length ?? 0) };
}
