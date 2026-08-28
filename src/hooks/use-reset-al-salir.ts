import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';

/** Resetea el estado de una pantalla de pestaña a su vista principal en dos casos:
 * al perder el foco (navegar a otra pestaña) y al volver a tocar el icono de esta
 * misma pestaña ya activa (expo-router no dispara focus/blur en ese caso, hace
 * falta escuchar 'tabPress' aparte). Mismo par de efectos repetido tal cual en
 * Inicio, Avisos, Pedidos, Obrador y Calendario -- revisión de calidad de código,
 * 2026-08-27.
 *
 * BUG REAL (Ariadna, 2026-08-28, "los botones se quedan estáticos" en Pedidos y
 * Obrador -- justo las dos pantallas con más re-renders por sus varios useQuery):
 * la primera versión metía `alReset` tal cual en las dependencias de
 * useFocusEffect/useEffect. Como cada pantalla define su función de reset de
 * nuevo en cada render (no memoizada), `alReset` cambiaba de identidad en CADA
 * render -- y useFocusEffect, al ver cambiar su callback, ejecuta primero la
 * limpieza (cleanup) del anterior antes de volver a suscribirse. Esa limpieza ERA
 * la propia función de reset (`() => alReset` como efecto devuelve `alReset` como
 * cleanup) -- así que cualquier re-render de la pantalla mientras estaba
 * enfocada (una respuesta de red, tocar cualquier fila...) disparaba el reset a
 * la vista principal en el acto, deshaciendo la navegación que se acababa de
 * hacer. Se veía como botones que "no hacen nada". Arreglado con una ref: la
 * función efecto que ve useFocusEffect/tabPress ya no cambia nunca de
 * identidad, así nunca se dispara su limpieza salvo al perder el foco de
 * verdad -- pero por dentro siempre llama a la versión más reciente de
 * `alReset` (vía la ref), así que tampoco hay closure obsoleta. */
export function useResetAlSalir(alReset: () => void): void {
  const navigation = useNavigation();
  const alResetRef = useRef(alReset);
  alResetRef.current = alReset;

  useFocusEffect(useCallback(() => () => alResetRef.current(), []));
  useEffect(() => navigation.addListener('tabPress' as never, () => alResetRef.current()), [navigation]);
}
