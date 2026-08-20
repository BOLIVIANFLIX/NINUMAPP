/** Cliente de la API de NINUMAPP -- backend propio (ver backend/), independiente de
 * ninuma-agente/la Raspberry. En desarrollo apunta al servidor local; en producción
 * apuntará al VPS cuando esté desplegado (ver API_URL más abajo). */

import { Platform } from 'react-native';

// 10.0.2.2 es "localhost del ordenador" visto desde el emulador Android; en un
// dispositivo físico o en web, localhost normal. Cuando haya VPS, esto pasa a ser
// una URL fija (https://api.ninumapp...) -- de momento, desarrollo local.
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${DEV_HOST}:8000`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function peticion<T>(ruta: string, opciones: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opciones.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
  if (!resp.ok) {
    let detalle = 'Error de conexión con el servidor.';
    try {
      const cuerpo = await resp.json();
      detalle = cuerpo.detail ?? detalle;
    } catch {
      // respuesta sin JSON -- se queda el mensaje genérico
    }
    throw new ApiError(detalle, resp.status);
  }
  return resp.json() as Promise<T>;
}

export interface LoginResultado {
  ok: true;
  token_pendiente: string;
  configurando_totp: boolean;
  totp_uri?: string;
}

export function login(usuario: string, password: string): Promise<LoginResultado> {
  return peticion('/api/auth/login', { method: 'POST', body: JSON.stringify({ usuario, password }) });
}

export interface TotpResultado {
  ok: true;
  token_sesion: string;
}

export function verificarTotp(tokenPendiente: string, codigo: string, dispositivo?: string): Promise<TotpResultado> {
  return peticion('/api/auth/totp/verificar', {
    method: 'POST',
    body: JSON.stringify({ token_pendiente: tokenPendiente, codigo, dispositivo }),
  });
}

export interface Resumen {
  usuario: string;
  ingresos_sin_iva_mes: number;
  facturas_pendientes_cobro: number;
  contactos_sin_resolver: number;
  aviso: string;
}

export function obtenerResumen(token: string): Promise<Resumen> {
  return peticion('/api/resumen', {}, token);
}
