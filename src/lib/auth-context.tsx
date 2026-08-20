/** Estado de sesión de NINUMAPP -- el token se guarda con expo-secure-store
 * (Keychain en iOS, Keystore cifrado en Android), nunca en AsyncStorage sin cifrar.
 * Igual que ninuma-agente: la sesión no caduca sola, solo se cierra a mano. */

import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const CLAVE_TOKEN = 'ninumapp_token_sesion';

// expo-secure-store no tiene implementación real en web (Keychain/Keystore no
// existen en un navegador) -- en web se usa localStorage, en la app nativa de
// verdad (Android/iOS, el objetivo real del proyecto) se usa el almacenamiento
// cifrado del sistema operativo.
const storage = {
  getItem: (clave: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(clave)) : SecureStore.getItemAsync(clave)),
  setItem: (clave: string, valor: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(clave, valor)) : SecureStore.setItemAsync(clave, valor),
  deleteItem: (clave: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(clave)) : SecureStore.deleteItemAsync(clave)),
};

interface AuthContextValor {
  token: string | null;
  cargando: boolean;
  guardarToken: (token: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValor | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    storage.getItem(CLAVE_TOKEN).then((guardado) => {
      setToken(guardado);
      setCargando(false);
    });
  }, []);

  async function guardarToken(nuevo: string) {
    await storage.setItem(CLAVE_TOKEN, nuevo);
    setToken(nuevo);
  }

  async function cerrarSesion() {
    await storage.deleteItem(CLAVE_TOKEN);
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, cargando, guardarToken, cerrarSesion }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}
