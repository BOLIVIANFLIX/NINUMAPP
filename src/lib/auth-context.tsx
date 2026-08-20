/** Estado de sesión de NINUMAPP. Al abrir la app: si hay un refresh token guardado
 * (Keystore/Keychain), se pide biometría (huella/rostro) y, si la hay disponible, se
 * usa para "desbloquear" el canje del refresh token por un access token nuevo -- sin
 * pedir usuario/contraseña/TOTP otra vez. Si el dispositivo no tiene biometría
 * configurada, se salta ese paso (el propio Keystore ya exige el móvil desbloqueado
 * para entregar el refresh token, así que no se deja a la app totalmente abierta). */

import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { API_URL, logout as logoutApi } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

type Estado = 'cargando' | 'autenticado' | 'desconectado';

interface AuthContextValor {
  estado: Estado;
  completarLogin: (accessToken: string, refreshToken: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValor | null>(null);

async function intentarBiometria(): Promise<boolean> {
  if (Platform.OS === 'web') return true; // sin Keystore/biometría real en web -- desarrollo
  const [hayHardware, hayEnrolada] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hayHardware || !hayEnrolada) return true; // sin biometría configurada -- no bloquea, ver comentario arriba
  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloquea NINUMAPP',
    cancelLabel: 'Usar usuario y contraseña',
    disableDeviceFallback: false, // si falla la huella, iOS/Android ofrecen el PIN del propio dispositivo
  });
  return resultado.success;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('cargando');

  useEffect(() => {
    return tokenStore.onSesionPerdida(() => setEstado('desconectado'));
  }, []);

  useEffect(() => {
    (async () => {
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) {
        setEstado('desconectado');
        return;
      }
      const autorizado = await intentarBiometria();
      if (!autorizado) {
        setEstado('desconectado');
        return;
      }
      try {
        const resp = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken, dispositivo: Platform.OS }),
        });
        if (!resp.ok) throw new Error('refresh falló');
        const datos = await resp.json();
        tokenStore.setAccessToken(datos.access_token);
        await tokenStore.setRefreshToken(datos.refresh_token);
        setEstado('autenticado');
      } catch {
        await tokenStore.clearRefreshToken();
        setEstado('desconectado');
      }
    })();
  }, []);

  async function completarLogin(accessToken: string, refreshToken: string) {
    tokenStore.setAccessToken(accessToken);
    await tokenStore.setRefreshToken(refreshToken);
    setEstado('autenticado');
  }

  async function cerrarSesion() {
    const refreshToken = await tokenStore.getRefreshToken();
    if (refreshToken) await logoutApi(refreshToken);
    await tokenStore.clearRefreshToken();
    tokenStore.setAccessToken(null);
    setEstado('desconectado');
  }

  return <AuthContext.Provider value={{ estado, completarLogin, cerrarSesion }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}
