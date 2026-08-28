/** Cliente HTTP de NINUMAPP -- backend propio (ver backend/), independiente de
 * ninuma-agente/la Raspberry. Axios con interceptor: si una petición falla con 401
 * (access token caducado, normal cada ACCESS_TOKEN_MINUTOS), intenta renovar con el
 * refresh token guardado y reintenta la petición UNA vez -- transparente para quien
 * llama, nunca hay que gestionar la renovación a mano en cada pantalla. */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

import { mutar } from '@/lib/action-queue';
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

export interface ProximaEntrega {
  cliente: string;
  fecha: string;
  descripcion: string | null;
  mas_ese_dia: number;
}

export interface ResumenFinanciero {
  ingresos_sin_iva_cobrados_mes: number;
  facturas_pendientes_cobro: { total_eur: number; documentos: number };
  acumulado_sin_facturar: {
    mensual: { total_eur: number; albaranes: number; clientes: string[] };
    directa: { total_eur: number; listas_para_emitir: number };
  };
  gastos_mes: number;
  contactos_sin_resolver: number;
  proxima_entrega: ProximaEntrega | null;
  hay_aviso_analisis: boolean;
}

export interface Resumen {
  usuario: string;
  pedidos_confirmados_mes: number;
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
  guest_email: string | null;
  guest_telefono: string | null;
  nif: string | null;
  es_empresa: boolean | null;
  es_cena: boolean;
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

// Compradores de Ediciones Especiales -- Ariadna, 2026-08-25: listado de quién ha
// reservado una cena o comprado un producto de edición, con acceso a su QR/código.

export interface LineaEdicion {
  nombre: string;
  unidades: number;
}

export interface CompradorEdicion {
  id: string;
  locator: string | null;
  cliente: string;
  guest_telefono: string | null;
  total_cents: number;
  recogida_fecha: string | null;
  es_cena: boolean;
  checked_in_at: string | null;
  creado_en: string;
  edicion_slug: string | null;
  lineas: LineaEdicion[];
}

export interface RespuestaCompradoresEdicion extends RespuestaConAviso<CompradorEdicion> {
  compradores: CompradorEdicion[];
}

export async function obtenerCompradoresEdicion(): Promise<RespuestaCompradoresEdicion> {
  const resp = await api.get('/api/pedidos/ediciones');
  return resp.data;
}

export function urlPedidoQr(id: string): string {
  return `${API_URL}/api/pedidos/ediciones/${id}/qr`;
}

// Mismas acciones que ya ofrece el bot de Telegram en la ficha completa de un
// pedido confirmado -- Ariadna, 2026-08-25.

export interface CambiosPedido {
  fecha?: string;
  nombre?: string;
  telefono?: string;
  nif?: string;
  es_empresa?: boolean;
  precio_cents?: number;
}

export async function editarPedido(id: string, cambios: CambiosPedido): Promise<void> {
  await mutar(`/api/pedidos/${id}/editar`, 'post', cambios);
}

export async function marcarPedidoEntregado(id: string): Promise<{ ok: boolean; status: string | null }> {
  const resp = await api.post(`/api/pedidos/${id}/entregado`);
  return resp.data;
}

export async function marcarPedidoPagado(id: string): Promise<void> {
  await mutar(`/api/pedidos/${id}/pagado`, 'post');
}

export interface AdjuntoPedido {
  id: string;
  tipo: 'pedido' | 'albaran';
  nombre: string;
  creadoEn: string;
  url: string | null;
}

export async function obtenerAdjuntosPedido(id: string): Promise<AdjuntoPedido[]> {
  const resp = await api.get(`/api/pedidos/${id}/adjuntos`);
  return resp.data.adjuntos;
}

export async function subirAdjuntoPedido(id: string, tipo: 'pedido' | 'albaran', uri: string): Promise<void> {
  const datos = new FormData();
  datos.append('tipo', tipo);
  datos.append('file', { uri, name: 'adjunto.jpg', type: 'image/jpeg' } as unknown as Blob);
  await api.post(`/api/pedidos/${id}/adjuntos`, datos);
}

export async function obtenerAlarmasNoVistas(): Promise<number> {
  const resp = await api.get('/api/obrador/alarmas-no-vistas');
  return resp.data.no_vistas;
}

export async function marcarAlarmasVistas(): Promise<void> {
  await mutar('/api/obrador/alarmas-marcar-vistas', 'post');
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

export function urlSnapshotCamara(entityId: string, v?: number): string {
  // `v` fuerza a que la URL cambie cada vez que se refresca sensores (React Query) --
  // sin esto, expo-image ve siempre la misma URI y muestra la foto cacheada de la
  // primera vez que se abrió la pantalla, aunque HA tenga una más reciente (bug real,
  // Ariadna, 2026-08-26: "las cámaras no actualizan, la imagen es de ayer por la noche").
  return `${API_URL}/api/obrador/camaras/${entityId}/snapshot${v ? `?v=${v}` : ''}`;
}

export interface SolicitudPendiente {
  id: string;
  creado_en: string;
  descripcion: string | null;
  cliente: string;
  kind: string;
  tipo_contacto: string | null;
  payment_status: string | null;
  recogida_fecha: string | null;
  guest_email: string | null;
  guest_telefono: string | null;
  nif: string | null;
  es_empresa: boolean | null;
  total_cents: number | null;
}

export interface RespuestaAvisos extends RespuestaConAviso<SolicitudPendiente> {
  solicitudes: SolicitudPendiente[];
  alarma_activa: string | null;
}

export async function obtenerAvisos(): Promise<RespuestaAvisos> {
  const resp = await api.get('/api/avisos');
  return resp.data;
}

export interface CambiosSolicitud {
  fecha?: string;
  nombre?: string;
  telefono?: string;
  nif?: string;
  es_empresa?: boolean;
  precio_cents?: number;
  tipo_contacto?: string;
}

/** Edita una solicitud (Correo sin resolver) directamente en la web -- mismos campos
 * que ya se pueden tocar por Telegram (nombre, teléfono, NIF/CIF, precio, empresa/
 * particular, fecha). Al incluir fecha, marca fecha_confirmada_por_operador y
 * sincroniza el calendario compartido. Ver app/services/avisos.py::editar_solicitud. */
export async function editarSolicitud(id: string, cambios: CambiosSolicitud): Promise<void> {
  await mutar(`/api/avisos/solicitud/${id}/editar`, 'post', cambios);
}

/** Da por vista una solicitud de tipo "informacion" (consulta, no pedido) sin fecha
 * ni evento de calendario -- ver SolicitudDetalle en avisos-pendientes.tsx. */
export async function descartarSolicitud(id: string, tipoContacto?: string): Promise<void> {
  await mutar(`/api/avisos/solicitud/${id}/descartar`, 'post', tipoContacto ? { tipo_contacto: tipoContacto } : {});
}

/** FormData con la foto -- se sube tal cual, sin fijar Content-Type a mano (axios/RN
 * ponen el boundary multipart correcto solas; fijarlo aquí lo rompería). */
function formDataDeFoto(uri: string): FormData {
  const datos = new FormData();
  datos.append('imagen', { uri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
  return datos;
}

// Un solo botón de escaneo -- la IA de ninuma-agente decide sola si es
// ticket_compra o albaran_propio (réplica de /panel/obrador, sub-sección
// Inventario). Ver inventario.escanear/confirmar/descartar en ninuma-agente.

export interface LineaTicketCompra {
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
  es_producto: boolean;
  product_id: number | null;
  nombre_grocy: string | null;
}

export interface LineaAlbaranPropio {
  descripcion: string;
  unidades: number;
  precio_unitario: number | null;
}

export type BorradorEscaneo =
  | {
      id: string;
      tipo: 'ticket_compra';
      categoria: string | null;
      proveedor: string | null;
      fecha: string | null;
      total: number | null;
      base_imponible: number | null;
      iva_importe: number | null;
      iva_porcentaje: number | null;
      lineas: LineaTicketCompra[];
    }
  | {
      id: string;
      tipo: 'albaran_propio';
      cliente: string | null;
      cliente_conocido: boolean;
      direccion_cliente: string | null;
      cif_cliente: string | null;
      numero: string | null;
      lineas: LineaAlbaranPropio[];
    };

export async function escanearInventario(uri: string): Promise<BorradorEscaneo> {
  const resp = await api.post('/api/inventario/escanear', formDataDeFoto(uri));
  return resp.data;
}

export interface ResultadoConfirmarInventario {
  ok: boolean;
  error?: string;
  sumadas?: string[];
  sin_emparejar?: string[];
  categoria?: string;
  /** Solo cuando el borrador era un albarán propio -- número real ya registrado en
   * contabilidad (ver inventario.confirmar en ninuma-agente). */
  numero?: string;
  resumen?: string;
}

export interface CorreccionTicket {
  categoria?: string;
  base_imponible?: number;
  iva_importe?: number;
  iva_porcentaje?: number;
}

export async function confirmarInventario(id: string, correccion?: CorreccionTicket): Promise<ResultadoConfirmarInventario> {
  const resp = await api.post('/api/inventario/confirmar', { id, ...correccion });
  return resp.data;
}

export async function descartarInventario(id: string): Promise<void> {
  await mutar('/api/inventario/descartar', 'post', { id });
}

export interface StockGrocy {
  producto_id: number;
  producto: string;
  cantidad: number;
}

export interface RespuestaStockInventario extends RespuestaConAviso<StockGrocy> {
  stock: StockGrocy[];
}

export async function obtenerStockActual(): Promise<RespuestaStockInventario> {
  const resp = await api.get('/api/inventario/stock-actual');
  return resp.data;
}

/** Corrige el stock de un producto a una cantidad exacta en Grocy -- Ariadna,
 * 2026-08-27: ajustes sobre la marcha (p.ej. tirar un bote estropeado) sin entrar
 * en Grocy directamente. */
export async function corregirStock(productoId: number, nuevaCantidad: number): Promise<void> {
  await mutar('/api/inventario/corregir-stock', 'post', { producto_id: productoId, nueva_cantidad: nuevaCantidad });
}

export interface MovimientoInventario {
  id: number;
  tipo: 'ticket_compra' | 'albaran_propio' | 'ajuste_manual';
  descripcion: string;
  creado_en: string;
}

export interface RespuestaMovimientosInventario extends RespuestaConAviso<MovimientoInventario> {
  movimientos: MovimientoInventario[];
}

export async function obtenerMovimientosInventario(): Promise<RespuestaMovimientosInventario> {
  const resp = await api.get('/api/inventario/movimientos-recientes');
  return resp.data;
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

export interface AlbaranMensual {
  numero: string;
  creado_en: string;
  total: number;
}

export interface GrupoAcumuladoMensual {
  cliente: string;
  albaranes: AlbaranMensual[];
}

export interface RespuestaAcumuladoMensual {
  grupos: GrupoAcumuladoMensual[];
  conectado: boolean;
  aviso: string | null;
}

export async function obtenerAcumuladoMensualItemizado(): Promise<RespuestaAcumuladoMensual> {
  const resp = await api.get('/api/pedidos-b2b/acumulado-mensual-itemizado');
  return resp.data;
}

export interface AlbaranFacturaCobro {
  numero: string;
  creado_en: string;
  total: number;
}

export interface GrupoFacturaCobroMensual {
  cliente: string;
  albaranes: AlbaranFacturaCobro[];
  total: number;
}

export interface FacturaCobroDirecta {
  numero: string;
  cliente: string;
  creado_en: string;
}

export interface RespuestaFacturasPendientesCobro {
  mensuales: GrupoFacturaCobroMensual[];
  directas: FacturaCobroDirecta[];
  conectado: boolean;
  aviso: string | null;
}

export async function obtenerFacturasPendientesCobro(): Promise<RespuestaFacturasPendientesCobro> {
  const resp = await api.get('/api/pedidos-b2b/facturas-pendientes-cobro');
  return resp.data;
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
  fecha_entrega: string | null;
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

// quitarLineaAlbaran/ponerReferenciaAlbaran/ponerFechaEntregaAlbaran se quedan sin
// pasar por mutar() a propósito -- son pasos de un asistente con estado en el
// backend (misma "sesion" que anadirLineaAlbaran/previsualizarAlbaran/finalizarAlbaran,
// ninguno de los cuales puede pasar por la cola: previsualizar/finalizar necesitan
// leer ese estado en el momento, y aplicar estos pasos más tarde en otro orden podría
// dejar la sesión inconsistente). Revisión de calidad de código, 2026-08-27.

export async function quitarLineaAlbaran(sesion: string, indice: number): Promise<void> {
  await api.post('/api/pedidos-b2b/albaran/linea/quitar', { sesion, indice });
}

export async function ponerReferenciaAlbaran(sesion: string, referencia: string): Promise<void> {
  await api.post('/api/pedidos-b2b/albaran/referencia', { sesion, referencia });
}

export async function ponerFechaEntregaAlbaran(sesion: string, fechaEntrega: string | null): Promise<void> {
  await api.post('/api/pedidos-b2b/albaran/fecha-entrega', { sesion, fecha_entrega: fechaEntrega });
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
  await mutar('/api/pedidos-b2b/marcar-facturado', 'post', { numero });
}

export async function cerrarCobroMensual(cliente: string): Promise<{ ok: boolean; marcados: number }> {
  const resp = await api.post('/api/pedidos-b2b/cerrar-cobro-mensual', { cliente });
  return resp.data;
}

export async function marcarCobrado(numero: string): Promise<void> {
  await mutar('/api/pedidos-b2b/marcar-cobrado', 'post', { numero });
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
  await mutar('/api/pedidos-b2b/grand-folies/descartar', 'post', { id });
}

// --- Pedidos B2B del carrito privado en la web --------------------------------

export interface LineaB2BCarrito {
  referencia: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
}

export interface PedidoB2BCarrito {
  id: string;
  cliente: string;
  referencia_pedido: string | null;
  fecha_entrega: string | null;
  /** Fecha que el cliente pidió al hacer el pedido en la web -- solo una sugerencia
   * para prellenar el selector, se puede cambiar igual que cualquier otra fecha. */
  fecha_solicitada: string | null;
  /** Compra real ya cobrada por Stripe (cuenta profesional que compró por la
   * tienda normal) -- al confirmar, se marca cobrado directamente sin esperar
   * un cobro aparte. false = pedido del carrito privado, sigue pendiente de cobro. */
  ya_pagado: boolean;
  lineas: LineaB2BCarrito[];
  faltantes: FaltanteMateriaPrima[] | null;
  creado_en: string;
}

export interface RespuestaB2BCarrito extends RespuestaConAviso<PedidoB2BCarrito> {
  pedidos: PedidoB2BCarrito[];
}

export async function obtenerB2BCarritoPendientes(): Promise<RespuestaB2BCarrito> {
  const resp = await api.get('/api/pedidos-b2b/b2b-carrito/pendientes');
  return resp.data;
}

export async function confirmarB2BCarrito(
  id: string,
  fechaEntrega: string | null,
  numeroManual: string | null,
  lineasFinales: LineaB2BCarrito[],
): Promise<ResultadoAlbaran> {
  const resp = await api.post('/api/pedidos-b2b/b2b-carrito/confirmar', {
    id,
    fecha_entrega: fechaEntrega,
    numero_manual: numeroManual,
    lineas_finales: lineasFinales,
  });
  return resp.data;
}

export async function descartarB2BCarrito(id: string): Promise<void> {
  await mutar('/api/pedidos-b2b/b2b-carrito/descartar', 'post', { id });
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

// --- Gestión de usuarios del panel (ninuma-agente) ---------------------------
// No confundir con el login propio de NINUMAPP (auth-context.tsx) -- esto
// administra las cuentas de ninuma-bot.tunga.es/panel.

export interface UsuarioPanel {
  usuario: string;
  creado_en: string;
  totp_activo: boolean;
}

export interface RespuestaUsuariosPanel extends RespuestaConAviso<UsuarioPanel> {
  usuarios: UsuarioPanel[];
}

export async function obtenerUsuariosPanel(): Promise<RespuestaUsuariosPanel> {
  const resp = await api.get('/api/usuarios-panel');
  return resp.data;
}

export interface ResultadoUsuarioPanel {
  ok: boolean;
  error?: string;
}

export async function crearUsuarioPanel(usuario: string, password: string): Promise<ResultadoUsuarioPanel> {
  const resp = await api.post('/api/usuarios-panel/crear', { usuario, password });
  return resp.data;
}

export async function eliminarUsuarioPanel(usuario: string): Promise<ResultadoUsuarioPanel> {
  const resp = await api.post('/api/usuarios-panel/eliminar', { usuario });
  return resp.data;
}

export async function cerrarSesionUsuarioPanel(usuario: string): Promise<void> {
  await mutar('/api/usuarios-panel/cerrar-sesion', 'post', { usuario });
}

export async function cambiarPasswordUsuarioPanel(usuario: string, password: string): Promise<ResultadoUsuarioPanel> {
  const resp = await api.post('/api/usuarios-panel/cambiar-password', { usuario, password });
  return resp.data;
}

// --- Calendario ---------------------------------------------------------------
// Lectura vía la API de Google Calendar (no WebView/embed) -- privado de verdad,
// nunca depende de que el calendario sea público. Mismo permiso de Google que Gmail.

export interface EventoCalendario {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  todo_el_dia: boolean;
  color: string | null;
}

export interface RespuestaCalendario extends RespuestaConAviso<EventoCalendario> {
  eventos: EventoCalendario[];
}

export async function obtenerEventosCalendario(desde: string, hasta: string): Promise<RespuestaCalendario> {
  const resp = await api.get('/api/calendario/eventos', { params: { desde, hasta } });
  return resp.data;
}

// --- Obrador: alarmas recientes (historial real de sensores) ------------------

export interface AlarmaReciente {
  texto: string;
  disparado_en: string;
}

export interface RespuestaAlarmasRecientes extends RespuestaConAviso<AlarmaReciente> {
  recientes: AlarmaReciente[];
}

export async function obtenerAlarmasRecientes(): Promise<RespuestaAlarmasRecientes> {
  const resp = await api.get('/api/obrador/alarmas-recientes');
  return resp.data;
}

// --- Análisis financiero --------------------------------------------------------

export type PeriodoAnalisis = 'semana' | 'mes' | 'anio' | 'rango';

export interface ResumenAnalisis {
  ingresos: number;
  margen: number;
  coste_materia_prima: number;
  gasto_compras: number;
  margen_pct: number | null;
}

export async function obtenerAnalisisResumen(p: PeriodoAnalisis, desde?: string, hasta?: string): Promise<ResumenAnalisis> {
  const resp = await api.get('/api/analisis/resumen', { params: { p, desde, hasta } });
  return resp.data;
}

export interface ProductoRentabilidad {
  nombre: string;
  unidades: number;
  ingresos: number;
  margen: number;
  margen_pct: number | null;
}

export async function obtenerAnalisisProductos(p: PeriodoAnalisis, desde?: string, hasta?: string): Promise<ProductoRentabilidad[]> {
  const resp = await api.get('/api/analisis/productos', { params: { p, desde, hasta } });
  return resp.data.ranking;
}

export interface IngredienteReceta {
  producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface RecetaCoste {
  id: number;
  nombre: string;
  base_servings: number;
  minutos_tanda: number | null;
  precio_hora_efectivo: number;
  coste_materia_prima: number;
  coste_mano_obra: number;
  coste_fijo_repercutido: number;
  coste_real: number;
  ingredientes: IngredienteReceta[];
}

export interface ConfigCostes {
  precio_hora_trabajo: number | null;
  horas_productivas_mes: number | null;
}

export interface RespuestaAnalisisRecetas {
  config: ConfigCostes;
  recetas: RecetaCoste[];
}

export async function obtenerAnalisisRecetas(): Promise<RespuestaAnalisisRecetas> {
  const resp = await api.get('/api/analisis/recetas');
  return resp.data;
}

export async function guardarConfigCostes(precioHora: number, horasMes: number): Promise<void> {
  await mutar('/api/analisis/costes/guardar-config', 'post', { precio_hora: precioHora, horas_mes: horasMes });
}

export async function guardarTiempoReceta(recipeId: number, minutos: number, precioHora: number): Promise<void> {
  await mutar('/api/analisis/costes/guardar-tiempo', 'post', { recipe_id: recipeId, minutos, precio_hora: precioHora });
}

export interface SubidaPrecio {
  ingrediente: string;
  precio_anterior: number;
  precio_actual: number;
  subida_pct: number;
}

export async function obtenerAnalisisPrecios(): Promise<SubidaPrecio[]> {
  const resp = await api.get('/api/analisis/precios');
  return resp.data.avisos;
}

// --- Impuestos / IVA trimestral + Modelo 130 ---------------------------------------
// No sustituyen al gestor -- ver ninuma-agente/inventario.py (iva_trimestre/
// modelo_130) para el alcance real: todos los canales (B2B, tienda web, apuntes de
// particular), criterio de caja para el IVA, devengo (regla general, sin
// minoraciones especiales ni retenciones) para el 130.

export interface IvaTrimestre {
  anio: number;
  trimestre: number;
  desde: string;
  hasta: string;
  iva_repercutido: number;
  base_imponible_repercutida: number;
  documentos_repercutido: number;
  iva_soportado: number;
  base_imponible_soportada: number;
  gastos_con_iva_leido: number;
  gastos_sin_iva_leido: number;
  iva_a_pagar_estimado: number;
  fecha_limite: string;
}

export async function obtenerIvaTrimestre(anio: number, trimestre: number): Promise<IvaTrimestre> {
  const resp = await api.get('/api/analisis/iva-trimestre', { params: { anio, trimestre } });
  return resp.data;
}

export interface Modelo130 {
  anio: number;
  trimestre: number;
  rendimiento_neto_acumulado: number;
  pago_fraccionado_acumulado: number;
  pago_trimestre_estimado: number;
  fecha_limite: string;
}

export async function obtenerModelo130(anio: number, trimestre: number): Promise<Modelo130> {
  const resp = await api.get('/api/analisis/modelo-130', { params: { anio, trimestre } });
  return resp.data;
}

export interface TrimestreResumen {
  anio: number;
  trimestre: number;
  iva_a_pagar_estimado: number;
  pago_130_estimado: number;
}

export async function obtenerTrimestresRecientes(anio: number, trimestre: number): Promise<TrimestreResumen[]> {
  const resp = await api.get('/api/analisis/trimestres-recientes', { params: { anio, trimestre } });
  return resp.data;
}

// --- Notificaciones push ------------------------------------------------------

export async function registrarTokenPush(token: string, plataforma: string): Promise<void> {
  await mutar('/api/notificaciones/registrar-token', 'post', { token, plataforma });
}

export interface PreferenciaNotificacion {
  tipo: string;
  etiqueta: string;
  activo: boolean;
}

export async function obtenerPreferenciasNotificaciones(): Promise<PreferenciaNotificacion[]> {
  const resp = await api.get('/api/notificaciones/preferencias');
  return resp.data;
}

export async function guardarPreferenciaNotificacion(tipo: string, activo: boolean): Promise<void> {
  await mutar('/api/notificaciones/preferencias', 'post', { tipo, activo });
}

export interface AvisoHistorial {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leido: boolean;
  creado_en: string;
}

export async function obtenerHistorialAvisos(): Promise<AvisoHistorial[]> {
  const resp = await api.get('/api/notificaciones/historial');
  return resp.data;
}

export async function obtenerAvisosNoLeidos(): Promise<number> {
  const resp = await api.get('/api/notificaciones/historial/no-leidos');
  return resp.data.no_leidos;
}

export async function marcarAvisoLeido(id: string): Promise<void> {
  await mutar(`/api/notificaciones/historial/${id}/leido`, 'post');
}

export async function marcarTodosAvisosLeidos(): Promise<void> {
  await mutar('/api/notificaciones/historial/marcar-todos-leidos', 'post');
}

export function urlTicketsPeriodo(desde: string, hasta: string): string {
  return `${API_URL}/api/inventario/tickets-periodo?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
}

// --- Ingresos y gastos -----------------------------------------------------------

export interface DocumentoDelMes {
  numero_documento: string;
  cliente: string;
  fecha: string;
  total: number;
}

export interface GastoFijo {
  id: number;
  categoria: string;
  descripcion: string | null;
  lugar_compra: string | null;
  producto: string | null;
  importe: number;
  fecha: string;
  recurrente: boolean;
  pagado: boolean;
}

export interface RespuestaIngresos {
  anio: number;
  mes: number;
  es_mes_actual: boolean;
  resumen: { ingresos: number; margen: number; gasto_compras: number; coste_materia_prima: number };
  documentos: DocumentoDelMes[];
  gastos_fijos: GastoFijo[];
  total_materia_prima: number;
  total_gastos_fijos: number;
  margen_neto: number;
}

export async function obtenerIngresosDelMes(mes?: string): Promise<RespuestaIngresos> {
  const resp = await api.get('/api/ingresos', { params: { mes } });
  return resp.data;
}

export interface CrearGastoBody {
  categoria: string;
  importe: number;
  fecha: string;
  descripcion?: string;
  lugar_compra?: string;
  producto?: string;
  recurrente?: boolean;
  pagado?: boolean;
}

export async function crearGasto(body: CrearGastoBody): Promise<void> {
  await mutar('/api/ingresos/gastos/crear', 'post', body);
}

export async function eliminarGasto(id: number): Promise<void> {
  await mutar('/api/ingresos/gastos/eliminar', 'post', { id });
}

export async function marcarGastoPagado(id: number): Promise<void> {
  await mutar('/api/ingresos/gastos/marcar-pagado', 'post', { id });
}

// --- Documentos históricos + ficha de cliente -------------------------------------

export interface DocumentoHistorico {
  numero: string;
  cliente: string;
  estado: string;
  creado_en: string;
  total: number | null;
}

export interface RespuestaTodosDocumentos extends RespuestaConAviso<DocumentoHistorico> {
  documentos: DocumentoHistorico[];
}

export async function obtenerTodosLosDocumentos(): Promise<RespuestaTodosDocumentos> {
  const resp = await api.get('/api/pedidos-b2b/documentos');
  return resp.data;
}

export interface LineaDocumento {
  descripcion: string;
  unidades: number;
  precio_unitario: number;
  importe: number;
}

export interface DocumentoDetalle {
  cliente: string;
  fecha_documento: string;
  total: number;
  lineas?: LineaDocumento[];
  /** Solo presentes en documentos B2B (con albarán registrado) -- un documento
   * particular no los trae, y la pantalla no debe ofrecer marcar facturado/cobrado
   * para esos. */
  facturado?: boolean;
  cobrado?: boolean;
}

export async function obtenerDocumentoDetalle(numero: string): Promise<DocumentoDetalle> {
  const resp = await api.get('/api/pedidos-b2b/documento', { params: { numero } });
  return resp.data;
}

export function urlDocumentoArchivo(numero: string, tipo: 'pdf' | 'docx'): string {
  return `${API_URL}/api/pedidos-b2b/documento/archivo?numero=${encodeURIComponent(numero)}&tipo=${tipo}`;
}

export interface ClienteDetalle {
  nombre: string;
  direccion: string | null;
  cif: string | null;
  nombre_documento: string | null;
  tipo_facturacion: string;
}

export interface AlbaranDeCliente {
  numero: string;
  estado: string;
  cobrado: boolean;
  creado_en: string;
}

export interface ProductoDeCliente {
  codigo: string | null;
  descripcion: string;
  ultimo_precio: number | null;
}

export interface RespuestaClienteDetalle {
  cliente: ClienteDetalle;
  albaranes: AlbaranDeCliente[];
  productos: ProductoDeCliente[];
}

export async function obtenerClienteDetalle(nombre: string): Promise<RespuestaClienteDetalle> {
  const resp = await api.get('/api/pedidos-b2b/clientes/detalle', { params: { nombre } });
  return resp.data;
}

export async function crearClienteProfesional(nombre: string, direccion: string, cif: string, tipoFacturacion: string): Promise<void> {
  await mutar('/api/pedidos-b2b/clientes/crear', 'post', { nombre, direccion, cif, tipo_facturacion: tipoFacturacion });
}

export interface ProductoCatalogo {
  id: number;
  cliente: string;
  codigo: string | null;
  descripcion: string;
  precio: number;
}

export async function obtenerCatalogoCliente(cliente: string): Promise<ProductoCatalogo[]> {
  const resp = await api.get('/api/pedidos-b2b/catalogo', { params: { cliente } });
  return resp.data.productos;
}

export async function crearProductoCatalogo(cliente: string, descripcion: string, precio: number, codigo?: string | null): Promise<void> {
  await mutar('/api/pedidos-b2b/catalogo/crear', 'post', { cliente, descripcion, precio, codigo: codigo || null });
}

export async function editarProductoCatalogo(id: number, descripcion: string, precio: number, codigo?: string | null): Promise<void> {
  await mutar('/api/pedidos-b2b/catalogo/editar', 'post', { id, descripcion, precio, codigo: codigo || null });
}

export async function eliminarProductoCatalogo(id: number): Promise<void> {
  await mutar('/api/pedidos-b2b/catalogo/eliminar', 'post', { id });
}

export async function editarClienteProfesional(
  nombre: string, direccion: string, cif: string, nombreDocumento: string | null, tipoFacturacion: string,
): Promise<void> {
  await mutar('/api/pedidos-b2b/clientes/editar', 'post', { nombre, direccion, cif, nombre_documento: nombreDocumento, tipo_facturacion: tipoFacturacion });
}

// --- Precio público de la tienda online (override, ver WBD/src/lib/preciosOverride.ts) ---

export async function guardarPrecioTienda(referencia: string, precio?: number, activo?: boolean): Promise<void> {
  await mutar('/api/precios-tienda/guardar', 'post', { referencia, precio, activo });
}

export interface PiezaCatalogo {
  numero: string;
  nombre: string;
  categoria: string;
  imagen: string;
  precio_contenido: number | null;
  precio_efectivo: number;
  activo: boolean;
  tiene_override: boolean;
}

export interface RespuestaCatalogoTienda extends RespuestaConAviso<PiezaCatalogo> {
  piezas: PiezaCatalogo[];
}

export async function obtenerCatalogoTienda(): Promise<RespuestaCatalogoTienda> {
  const resp = await api.get('/api/precios-tienda/catalogo');
  return resp.data;
}

export async function eliminarPrecioTienda(referencia: string): Promise<void> {
  await mutar('/api/precios-tienda/eliminar', 'post', { referencia });
}

// --- Avisos: correo → pedido, confirmar/mover pedido web -------------------------

export interface EncargoPendiente {
  id: number;
  categoria: string;
  cliente: string | null;
  resumen: string | null;
  urgente: boolean;
  fecha_mencionada: string | null;
  visto: boolean;
}

export interface PedidoWebPendiente {
  locator: string;
  cliente: string | null;
  kind: string | null;
  total_cents: number | null;
  recogida_fecha: string | null;
  visto: boolean;
}

export interface RespuestaAvisosPendientes {
  encargos: EncargoPendiente[];
  pedidos_web: PedidoWebPendiente[];
  intentos_fallidos_login: number;
  preguntas_margen_pendientes: number;
  conectado: boolean;
  aviso: string | null;
}

export async function obtenerAvisosPendientes(): Promise<RespuestaAvisosPendientes> {
  const resp = await api.get('/api/avisos/pendientes');
  return resp.data;
}

export async function emailAsignarDia(id: number, fecha: string, descripcion: string): Promise<void> {
  await mutar('/api/avisos/email/asignar-dia', 'post', { id, fecha, descripcion });
}

// pedidoWebConfirmar/pedidoWebMover se quitaron el 2026-08-27 -- auditoría de bases
// de datos: solo escribían la fecha en local, nunca en la web de verdad, y
// AsuntoPedidoWeb (única pantalla que los llamaba) no estaba enganchada a ningún
// sitio real de la app. Confirmar/mover una solicitud hoy pasa por editarSolicitud.

export function mensajeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { detail?: string } | undefined)?.detail ?? 'No se ha podido conectar con el servidor.';
  }
  return 'No se ha podido conectar con el servidor.';
}
