/** Cliente HTTP de NINUMAPP -- backend propio (ver backend/), independiente de
 * ninuma-agente/la Raspberry. Axios con interceptor: si una petición falla con 401
 * (access token caducado, normal cada ACCESS_TOKEN_MINUTOS), intenta renovar con el
 * refresh token guardado y reintenta la petición UNA vez -- transparente para quien
 * llama, nunca hay que gestionar la renovación a mano en cada pantalla. */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

import { tokenStore } from '@/lib/token-store';

// 10.0.2.2 es "localhost del ordenador" visto desde el emulador Android; en un
// dispositivo físico o en web, localhost normal. Cuando haya VPS, EXPO_PUBLIC_API_URL
// pasa a ser la URL fija del servidor.
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
// || (no ??) a propósito: un .env con la variable presente pero vacía ("=" sin
// valor, caso normal en desarrollo) da process.env.EXPO_PUBLIC_API_URL === '' --
// ?? no trata eso como "sin valor" y se quedaría con una baseURL vacía.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${DEV_HOST}:8000`;

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Cola de peticiones que esperan a que termine una renovación ya en marcha -- si
// llegan 3 peticiones a la vez y todas reciben 401, solo se pide UN refresh, las
// otras dos esperan ese mismo resultado en vez de disparar 3 renovaciones a la vez
// (cada una rotaría el refresh token e invalidaría el de las demás).
let renovando: Promise<string | null> | null = null;

async function renovarAccessToken(): Promise<string | null> {
  const refreshToken = await tokenStore.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const resp = await axios.post(`${API_URL}/api/auth/refresh`, { refresh_token: refreshToken, dispositivo: Platform.OS });
    await tokenStore.setRefreshToken(resp.data.refresh_token);
    tokenStore.setAccessToken(resp.data.access_token);
    return resp.data.access_token as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _reintentado?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._reintentado) {
      throw error;
    }
    original._reintentado = true;

    if (!renovando) renovando = renovarAccessToken().finally(() => (renovando = null));
    const nuevoToken = await renovando;

    if (!nuevoToken) {
      await tokenStore.clearRefreshToken();
      tokenStore.avisarSesionPerdida();
      throw error;
    }
    original.headers.Authorization = `Bearer ${nuevoToken}`;
    return api(original);
  },
);

export interface LoginResultado {
  ok: true;
  token_pendiente: string;
  configurando_totp: boolean;
  totp_uri?: string;
}

export async function login(usuario: string, password: string): Promise<LoginResultado> {
  const resp = await api.post('/api/auth/login', { usuario, password });
  return resp.data;
}

export interface TotpResultado {
  ok: true;
  access_token: string;
  refresh_token: string;
}

export async function verificarTotp(tokenPendiente: string, codigo: string, dispositivo?: string): Promise<TotpResultado> {
  const resp = await api.post('/api/auth/totp/verificar', { token_pendiente: tokenPendiente, codigo, dispositivo });
  return resp.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/api/auth/logout', { refresh_token: refreshToken }).catch(() => {});
}

export interface Resumen {
  usuario: string;
  ingresos_sin_iva_mes: number;
  facturas_pendientes_cobro: number;
  contactos_sin_resolver: number;
  aviso: string;
}

export async function obtenerResumen(): Promise<Resumen> {
  const resp = await api.get('/api/resumen');
  return resp.data;
}

export interface Pedido {
  id: string;
  status: string;
  creado_en: string;
  total_cents: number;
  locator: string | null;
  kind: string;
  recogida_fecha: string | null;
  payment_status: string | null;
  descripcion: string | null;
  cliente: string;
}

export interface RespuestaConAviso<T> {
  conectado: boolean;
  aviso: string | null;
}

export interface RespuestaPedidos extends RespuestaConAviso<Pedido> {
  pedidos: Pedido[];
}

export async function obtenerPedidos(): Promise<RespuestaPedidos> {
  const resp = await api.get('/api/pedidos');
  return resp.data;
}

export interface AlarmaHA {
  entity_id: string;
  nombre: string;
  ultima_vez: string | null;
}

export interface RespuestaAlarmas extends RespuestaConAviso<AlarmaHA> {
  alarmas: AlarmaHA[];
}

export async function obtenerAlarmas(): Promise<RespuestaAlarmas> {
  const resp = await api.get('/api/obrador/alarmas');
  return resp.data;
}

export interface Receta {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface RespuestaRecetas extends RespuestaConAviso<Receta> {
  recetas: Receta[];
}

export async function obtenerRecetas(): Promise<RespuestaRecetas> {
  const resp = await api.get('/api/obrador/recetas');
  return resp.data;
}

export function mensajeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { detail?: string } | undefined)?.detail ?? 'No se ha podido conectar con el servidor.';
  }
  return 'No se ha podido conectar con el servidor.';
}
