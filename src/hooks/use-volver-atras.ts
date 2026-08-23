import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/** Intercepta el botón/gesto de "atrás" de Android -- si la pantalla no está en su
 * vista principal, vuelve ahí en vez de dejar que Android salga de la app o navegue
 * a otro sitio (bug real: "dar para atrás me saca de la app", Ariadna 2026-08-23).
 *
 * Como BackHandler apila los listeners (el último registrado se prueba primero), un
 * componente hijo con su propio paso interno (p.ej. AlbaranWizard) puede usar este
 * mismo hook para retroceder un paso a la vez -- solo cuando ese hijo ya está en su
 * propio paso inicial deja de registrar el listener, y el evento cae al padre. Así
 * "atrás" siempre lleva a la página anterior, hasta terminar en el menú principal. */
export function useVolverAtras(enEstadoPrincipal: boolean, volver: () => void): void {
  useEffect(() => {
    if (enEstadoPrincipal) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      volver();
      return true;
    });
    return () => sub.remove();
  }, [enEstadoPrincipal, volver]);
}
