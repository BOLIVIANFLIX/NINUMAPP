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

// --- Generar albarán --------------------------------------------------------
// Asistente en pasos, "sesion" identifica el alta en curso (la crea el backend al
// iniciar). Nada de esto escribe de verdad hasta /finalizar (numeración/stock/
// contabilidad reales) -- todo lo anterior es un borrador que se puede abandonar sin
// dejar rastro.

export async function obtenerClientesParaAlbaran(): Promise<{ nombre: string }[]> {
  const resp = await api.get('/api/pedidos-b2b/albaran/clientes');
  return resp.data.clientes;
}

export async function iniciarAlbaran(cliente: string): Promise<string> {
  const resp = await api.post('/api/pedidos-b2b/albaran/iniciar', { cliente });
  return resp.data.sesion;
}

export interface LineaAlbaran {
  descripcion: string;
  unidades: number;
  referencia: string | null;
  precio_unitario: number;
}

export interface CatalogoItem {
  codigo: string | null;
  descripcion: string;
}

export interface EstadoAlbaran {
  cliente: string;
  lineas: LineaAlbaran[];
  catalogo: CatalogoItem[];
  precio_libre: boolean;
  referencia_pedido: string | null;
  es_grand_folies: boolean;
}

export async function obtenerEstadoAlbaran(sesion: string): Promise<EstadoAlbaran> {
  const resp = await api.get('/api/pedidos-b2b/albaran/estado', { params: { sesion } });
  return resp.data;
}

export async function anadirLineaAlbaran(
  sesion: string,
  descripcion: string,
  unidades: number,
  codigo?: string | null,
  precioUnitario?: number | null,
): Promise<{ ok: boolean; falta_precio?: boolean; error?: string }> {
  const resp = await api.post('/api/pedidos-b2b/albaran/linea', {
    sesion,
    descripcion,
    unidades,
    codigo: codigo ?? null,
    precio_unitario: precioUnitario ?? null,
  });
  return resp.data;
}

export async function quitarLineaAlbaran(sesion: string, indice: number): Promise<void> {
  await api.post('/api/pedidos-b2b/albaran/linea/quitar', { sesion, indice });
}

export async function ponerReferenciaAlbaran(sesion: string, referencia: string): Promise<void> {
  await api.post('/api/pedidos-b2b/albaran/referencia', { sesion, referencia });
}

export interface FaltanteMateriaPrima {
  producto: string;
  necesario: number;
  disponible: number;
  falta: number;
}

export interface PrevisualizacionAlbaran {
  cliente: string;
  lineas: (LineaAlbaran & { receta: string | null; importe: number })[];
  subtotal: number;
  iva: number;
  total: number;
  siguiente_numero_automatico: string;
  faltantes: FaltanteMateriaPrima[];
}

export async function previsualizarAlbaran(sesion: string): Promise<PrevisualizacionAlbaran> {
  const resp = await api.get('/api/pedidos-b2b/albaran/previsualizar', { params: { sesion } });
  return resp.data;
}

export interface ResultadoAlbaran {
  generar_documento: boolean;
  resumen: string;
  numero_mostrado: string;
  numero_seguimiento: string;
  ruta_docx: string | null;
  ruta_pdf: string | null;
  pdf_fallo: boolean;
  nombre_base: string | null;
}

export async function finalizarAlbaran(sesion: string, numeroManual: string | null, registrar: boolean): Promise<ResultadoAlbaran> {
  const resp = await api.post('/api/pedidos-b2b/albaran/finalizar', { sesion, numero_manual: numeroManual, registrar });
  return resp.data;
}

export function urlDescargarAlbaran(sesion: string, tipo: 'docx' | 'pdf'): string {
  return `${API_URL}/api/pedidos-b2b/albaran/descargar?sesion=${encodeURIComponent(sesion)}&tipo=${tipo}`;
}

// --- Cerrar mes / marcar facturado / marcar cobrado -------------------------

export async function cerrarMes(cliente: string): Promise<{ ok: boolean; marcados: number }> {
  const resp = await api.post('/api/pedidos-b2b/cerrar-mes', { cliente });
  return resp.data;
}

export async function marcarFacturado(numero: string): Promise<void> {
  await api.post('/api/pedidos-b2b/marcar-facturado', { numero });
}

export async function cerrarCobroMensual(cliente: string): Promise<{ ok: boolean; marcados: number }> {
  const resp = await api.post('/api/pedidos-b2b/cerrar-cobro-mensual', { cliente });
  return resp.data;
}

export async function marcarCobrado(numero: string): Promise<void> {
  await api.post('/api/pedidos-b2b/marcar-cobrado', { numero });
}

// --- Grand Folies ------------------------------------------------------------

export interface LineaGrandFolies {
  referencia: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
}

export interface PedidoGrandFolies {
  id: string;
  numero_pedido: string | null;
  fecha_entrega: string | null;
  lineas: LineaGrandFolies[];
  faltantes: FaltanteMateriaPrima[] | null;
  creado_en: string;
}

export interface RespuestaGrandFolies extends RespuestaConAviso<PedidoGrandFolies> {
  pedidos: PedidoGrandFolies[];
}

export async function obtenerGrandFoliesPendientes(): Promise<RespuestaGrandFolies> {
  const resp = await api.get('/api/pedidos-b2b/grand-folies/pendientes');
  return resp.data;
}

export async function confirmarGrandFolies(
  id: string,
  fechaEntrega: string | null,
  numeroPedido: string | null,
  numeroManual: string | null,
  lineasFinales: LineaGrandFolies[],
): Promise<ResultadoAlbaran> {
  const resp = await api.post('/api/pedidos-b2b/grand-folies/confirmar', {
    id,
    fecha_entrega: fechaEntrega,
    numero_pedido: numeroPedido,
    numero_manual: numeroManual,
    lineas_finales: lineasFinales,
  });
  return resp.data;
}

export async function descartarGrandFolies(id: string): Promise<void> {
  await api.post('/api/pedidos-b2b/grand-folies/descartar', { id });
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
