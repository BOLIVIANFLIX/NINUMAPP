/** Almacén de tokens compartido -- fuera de React a propósito, para que el
 * interceptor de Axios (api.ts) pueda leer/renovar el token sin depender de un
 * componente montado. AuthProvider (auth-context.tsx) es la capa de React por
 * encima, para la UI (pantalla de carga, login, etc). */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CLAVE_REFRESH = 'ninumapp_refresh_token';

// expo-secure-store no tiene implementación real en web -- en web se usa
// localStorage, en la app nativa de verdad (Android/iOS) el almacenamiento cifrado
// del sistema (Keystore/Keychain).
const storageSeguro = {
  getItem: (clave: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(clave)) : SecureStore.getItemAsync(clave)),
  setItem: (clave: string, valor: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(clave, valor)) : SecureStore.setItemAsync(clave, valor),
  deleteItem: (clave: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(clave)) : SecureStore.deleteItemAsync(clave)),
};

// El access token vive solo en memoria (nunca en disco) -- es de corta duración por
// diseño, no hace falta persistirlo; se recupera con el refresh token + biometría al
// reabrir la app.
let accessTokenEnMemoria: string | null = null;
let avisosSesionPerdida: Array<() => void> = [];

export const tokenStore = {
  getAccessToken: () => accessTokenEnMemoria,
  setAccessToken: (token: string | null) => {
    accessTokenEnMemoria = token;
  },
  getRefreshToken: () => storageSeguro.getItem(CLAVE_REFRESH),
  setRefreshToken: (token: string) => storageSeguro.setItem(CLAVE_REFRESH, token),
  clearRefreshToken: () => storageSeguro.deleteItem(CLAVE_REFRESH),

  /** Se llama cuando el interceptor de Axios agota los reintentos (refresh token
   * inválido/caducado/revocado) -- avisa a AuthProvider para que vuelva a mostrar el
   * login, sin que api.ts necesite saber nada de React. */
  onSesionPerdida(callback: () => void) {
    avisosSesionPerdida.push(callback);
    return () => {
      avisosSesionPerdida = avisosSesionPerdida.filter((c) => c !== callback);
    };
  },
  avisarSesionPerdida() {
    accessTokenEnMemoria = null;
    avisosSesionPerdida.forEach((c) => c());
  },
};
