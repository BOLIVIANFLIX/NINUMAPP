import { useCallback, useEffect } from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';

/** Resetea el estado de una pantalla de pestaña a su vista principal en dos casos:
 * al perder el foco (navegar a otra pestaña) y al volver a tocar el icono de esta
 * misma pestaña ya activa (expo-router no dispara focus/blur en ese caso, hace
 * falta escuchar 'tabPress' aparte). Mismo par de efectos repetido tal cual en
 * Inicio, Avisos, Pedidos, Obrador y Calendario -- revisión de calidad de código,
 * 2026-08-27. */
export function useResetAlSalir(alReset: () => void): void {
  const navigation = useNavigation();
  useFocusEffect(useCallback(() => alReset, [alReset]));
  useEffect(() => navigation.addListener('tabPress' as never, alReset), [navigation, alReset]);
}
