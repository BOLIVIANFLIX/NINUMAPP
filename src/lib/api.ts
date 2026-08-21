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

export interface ResumenFinanciero {
  ingresos_sin_iva_cobrados_mes: number;
  facturas_pendientes_cobro: { total_eur: number; documentos: number };
  acumulado_sin_facturar: {
    mensual: { total_eur: number; albaranes: number; clientes: string[] };
    directa: { total_eur: number; listas_para_emitir: number };
  };
  gastos_mes: number;
}

export interface Resumen {
  usuario: string;
  pedidos_confirmados_mes: number;
  solicitudes_pendientes: number;
  financiero: ResumenFinanciero | null;
  financiero_conectado: boolean;
  aviso: string | null;
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

export interface SensorHA {
  entity_id: string;
  etiqueta: string;
  valor: string | null;
  unidad: string | null;
}

export interface CamaraHA {
  entity_id: string;
  etiqueta: string;
}

export interface RespuestaSensores {
  sensores: SensorHA[];
  alarma_activa: string | null;
  camaras: CamaraHA[];
  conectado: boolean;
  aviso: string | null;
}

export async function obtenerSensores(): Promise<RespuestaSensores> {
  const resp = await api.get('/api/obrador/sensores');
  return resp.data;
}

export function urlSnapshotCamara(entityId: string): string {
  return `${API_URL}/api/obrador/camaras/${entityId}/snapshot`;
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

export interface SolicitudPendiente {
  id: string;
  creado_en: string;
  descripcion: string | null;
  cliente: string;
}

export interface RespuestaAvisos extends RespuestaConAviso<SolicitudPendiente> {
  solicitudes: SolicitudPendiente[];
  alarma_activa: string | null;
}

export async function obtenerAvisos(): Promise<RespuestaAvisos> {
  const resp = await api.get('/api/avisos');
  return resp.data;
}

export interface LineaTicket {
  producto_leido: string;
  cantidad: number;
  precio_unitario: number | null;
  producto_id: number | null;
  producto_nombre: string | null;
  confianza: number;
}

export interface LineaAlbaran {
  producto_leido: string;
  cantidad: number;
  receta_id: number | null;
  receta_nombre: string | null;
  confianza: number;
}

/** FormData con la foto -- se sube tal cual, sin fijar Content-Type a mano (axios/RN
 * ponen el boundary multipart correcto solas; fijarlo aquí lo rompería). */
function formDataDeFoto(uri: string): FormData {
  const datos = new FormData();
  datos.append('imagen', { uri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
  return datos;
}

export async function escanearTicket(uri: string): Promise<LineaTicket[]> {
  const resp = await api.post('/api/inventario/ticket/escanear', formDataDeFoto(uri));
  return resp.data.lineas;
}

export async function confirmarTicket(lineas: { producto_id: number; cantidad: number; precio_unitario: number | null }[]): Promise<void> {
  await api.post('/api/inventario/ticket/confirmar', { lineas });
}

export async function escanearAlbaran(uri: string): Promise<LineaAlbaran[]> {
  const resp = await api.post('/api/inventario/albaran/escanear', formDataDeFoto(uri));
  return resp.data.lineas;
}

export async function confirmarAlbaran(lineas: { receta_id: number; cantidad: number }[]): Promise<void> {
  await api.post('/api/inventario/albaran/confirmar', { lineas });
}

export interface Cliente {
  id: string;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  nif: string | null;
  notas: string | null;
  creado_en: string;
}

export interface ClienteBody {
  nombre: string;
  empresa?: string | null;
  telefono?: string | null;
  email?: string | null;
  nif?: string | null;
  notas?: string | null;
}

export async function obtenerClientes(): Promise<Cliente[]> {
  const resp = await api.get('/api/clientes');
  return resp.data;
}

export async function crearCliente(body: ClienteBody): Promise<Cliente> {
  const resp = await api.post('/api/clientes', body);
  return resp.data;
}

export async function actualizarCliente(id: string, body: ClienteBody): Promise<Cliente> {
  const resp = await api.put(`/api/clientes/${id}`, body);
  return resp.data;
}

export type EstadoPedidoPropio = 'pendiente' | 'confirmado' | 'entregado' | 'cobrado';

export interface PedidoPropio {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  descripcion: string;
  total_cents: number;
  fecha_entrega: string | null;
  estado: EstadoPedidoPropio;
  creado_en: string;
}

export interface PedidoPropioBody {
  cliente_id: string;
  descripcion: string;
  total_cents: number;
  fecha_entrega?: string | null;
  estado: EstadoPedidoPropio;
}

export async function obtenerPedidosPropios(): Promise<PedidoPropio[]> {
  const resp = await api.get('/api/pedidos-propios');
  return resp.data;
}

export async function crearPedidoPropio(body: PedidoPropioBody): Promise<PedidoPropio> {
  const resp = await api.post('/api/pedidos-propios', body);
  return resp.data;
}

export async function actualizarPedidoPropio(id: string, body: PedidoPropioBody): Promise<PedidoPropio> {
  const resp = await api.put(`/api/pedidos-propios/${id}`, body);
  return resp.data;
}

export interface CorreoPendiente {
  id: string;
  de: string;
  asunto: string;
  resumen: string;
  fecha: string;
}

export interface RespuestaCorreos extends RespuestaConAviso<CorreoPendiente> {
  correos: CorreoPendiente[];
}

export async function obtenerCorreosPendientes(): Promise<RespuestaCorreos> {
  const resp = await api.get('/api/gmail/correos-pendientes');
  return resp.data;
}

export interface ClienteProfesional {
  nombre: string;
  tipo_facturacion: 'directa' | 'mensual';
  albaranes_abiertos: number;
}

export interface RespuestaClientesProfesionales extends RespuestaConAviso<ClienteProfesional> {
  clientes: ClienteProfesional[];
}

export async function obtenerClientesProfesionales(): Promise<RespuestaClientesProfesionales> {
  const resp = await api.get('/api/pedidos-b2b/clientes');
  return resp.data;
}

export interface DocumentoReciente {
  numero: string;
  cliente: string;
  estado: string;
  creado_en: string;
}

export interface RespuestaDocumentosRecientes extends RespuestaConAviso<DocumentoReciente> {
  documentos: DocumentoReciente[];
}

export async function obtenerDocumentosRecientes(): Promise<RespuestaDocumentosRecientes> {
  const resp = await api.get('/api/pedidos-b2b/documentos-recientes');
  return resp.data;
}

export function mensajeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { detail?: string } | undefined)?.detail ?? 'No se ha podido conectar con el servidor.';
  }
  return 'No se ha podido conectar con el servidor.';
}
