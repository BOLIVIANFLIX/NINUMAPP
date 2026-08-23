import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registrarTokenPush } from '@/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Pide permiso de notificaciones y registra el token de Expo del dispositivo en
 * NINUMAPP -- pedido explícito de Ariadna 2026-08-23, primer paso para poder ir
 * sustituyendo avisos de Telegram por push. Se llama una vez por sesión iniciada
 * (ver _layout.tsx), no bloquea nada si falla (dispositivo sin permiso, emulador sin
 * Google Play Services, etc.) -- el resto de la app funciona igual sin push. */
export function useRegistrarPush(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    if (!Device.isDevice) return; // los push de Expo no funcionan en emulador

    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'NINUMAPP',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const permisoActual = await Notifications.getPermissionsAsync();
        let estado = permisoActual.status;
        if (estado !== 'granted') {
          const pedido = await Notifications.requestPermissionsAsync();
          estado = pedido.status;
        }
        if (estado !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        await registrarTokenPush(token, Platform.OS);
      } catch {
        // Sin permiso, sin Google Play Services, red caída al registrar... ninguno de
        // estos casos debe interrumpir el uso normal de la app.
      }
    })();
  }, [activo]);
}
