import { useEffect, useState } from 'react';

import { suscribirseATamanoCola } from '@/lib/action-queue';

/** Nº de acciones esperando a que vuelva la conexión -- para mostrar un aviso
 * discreto en la interfaz (ver _layout.tsx). */
export function useColaPendiente(): number {
  const [n, setN] = useState(0);
  useEffect(() => suscribirseATamanoCola(setN), []);
  return n;
}
