/** Cola de acciones sin conexión (punto 3 del prompt acordado el 2026-08-20). Si no
 * hay red, las escrituras (POST/PUT/PATCH/DELETE) no fallan -- se guardan aquí y se
 * despachan en orden (FIFO) en cuanto vuelve la conexión. El servidor sigue siendo la
 * fuente de la verdad; cada acción lleva su `clientTimestamp` (el momento real en que
 * ocurrió, no cuando se envía) para que el backend pueda usarlo en vez de la hora del
 * servidor al procesarla -- ver backend/app/offline.py.
 *
 * Guardada en AsyncStorage (no MMKV): más simple, funciona igual en web (para poder
 * seguir probando en el navegador durante el desarrollo) y nativo, y el volumen de
 * datos de una cola de acciones de una usuaria es minúsculo -- no hace falta el
 * rendimiento extra de MMKV para esto.
 *
 * Semántica de fallo: si una acción falla al despachar, la cola SE PARA ahí -- no se
 * salta a la siguiente. Aplicar las acciones fuera de orden podría dejar el negocio
 * en un estado incoherente (p.ej. "marcar cobrado" antes de "crear el pedido"), así
 * que es mejor reintentar desde el mismo punto la próxima vez que aceptar ese riesgo. */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { api } from '@/lib/api';

const CLAVE_COLA = 'ninumapp_cola_acciones';

export type MetodoEscritura = 'post' | 'put' | 'patch' | 'delete';

export interface AccionEncolada {
  id: string;
  endpoint: string;
  metodo: MetodoEscritura;
  payload: unknown;
  clientTimestamp: string;
  creadaEn: string;
}

let suscriptores: Array<(n: number) => void> = [];
let despachando = false;

async function leerCola(): Promise<AccionEncolada[]> {
  const crudo = await AsyncStorage.getItem(CLAVE_COLA);
  return crudo ? (JSON.parse(crudo) as AccionEncolada[]) : [];
}

async function guardarCola(cola: AccionEncolada[]): Promise<void> {
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  suscriptores.forEach((cb) => cb(cola.length));
}

export function suscribirseATamanoCola(callback: (n: number) => void): () => void {
  suscriptores.push(callback);
  leerCola().then((cola) => callback(cola.length));
  return () => {
    suscriptores = suscriptores.filter((cb) => cb !== callback);
  };
}

export async function encolarAccion(endpoint: string, metodo: MetodoEscritura, payload: unknown): Promise<void> {
  const cola = await leerCola();
  cola.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    endpoint,
    metodo,
    payload,
    clientTimestamp: new Date().toISOString(),
    creadaEn: new Date().toISOString(),
  });
  await guardarCola(cola);
}

export async function contarPendientes(): Promise<number> {
  return (await leerCola()).length;
}

/** api.delete tiene una firma distinta (url, config) a post/put/patch (url, data,
 * config) -- TypeScript no puede resolver la sobrecarga correcta indexando
 * dinámicamente por `metodo`, así que se separa explícitamente aquí. DELETE con
 * cuerpo es poco común pero se admite igual (algún endpoint podría necesitarlo), vía
 * `config.data`. */
async function enviar(endpoint: string, metodo: MetodoEscritura, payload: unknown) {
  if (metodo === 'delete') return api.delete(endpoint, { data: payload });
  return api[metodo](endpoint, payload);
}

/** Despacha la cola en orden. Se puede llamar tantas veces como se quiera (al volver
 * la conexión, al abrir la app...) -- el candado `despachando` evita que dos llamadas
 * simultáneas procesen la misma acción dos veces. */
export async function procesarCola(): Promise<void> {
  if (despachando) return;
  despachando = true;
  try {
    let cola = await leerCola();
    while (cola.length > 0) {
      const accion = cola[0];
      try {
        // client_timestamp viaja dentro del payload -- ver backend/app/offline.py,
        // resolver_fecha() lo busca ahí en vez de en la query string.
        const payloadConFecha =
          accion.payload && typeof accion.payload === 'object'
            ? { ...(accion.payload as Record<string, unknown>), client_timestamp: accion.clientTimestamp }
            : accion.payload;
        await enviar(accion.endpoint, accion.metodo, payloadConFecha);
      } catch (err) {
        // Sin respuesta del servidor (red caída de nuevo, timeout) -- se para aquí,
        // se reintenta en el próximo procesarCola(). Si el servidor SÍ respondió
        // (400/500...) es un fallo real de la acción, no de conexión -- también se
        // para, para no perder la acción silenciosamente; queda pendiente de revisar
        // a mano en vez de descartarla.
        break;
      }
      cola = cola.slice(1);
      await guardarCola(cola);
    }
  } finally {
    despachando = false;
  }
}

export function esFalloDeRed(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

/** Punto de entrada para cualquier escritura de la app (crear/editar/borrar algo).
 * Si hay red, se manda directa y se devuelve la respuesta real. Si no hay red -- o si
 * NetInfo decía que sí pero la petición falla igual por conexión (pasa más de lo que
 * parece) -- se encola en vez de mostrar un error, y se avisa a quien llama que ha
 * quedado pendiente para poder enseñarlo en la interfaz ("guardado, se enviará al
 * volver la conexión" en vez de un error duro). */
export async function mutar<T = unknown>(
  endpoint: string,
  metodo: MetodoEscritura,
  payload?: unknown,
): Promise<{ encolada: false; data: T } | { encolada: true }> {
  const estado = await NetInfo.fetch();
  const conectado = estado.isConnected === true && estado.isInternetReachable !== false;

  if (!conectado) {
    await encolarAccion(endpoint, metodo, payload);
    return { encolada: true };
  }

  try {
    const resp = await enviar(endpoint, metodo, payload);
    return { encolada: false, data: resp.data as T };
  } catch (err) {
    if (esFalloDeRed(err)) {
      await encolarAccion(endpoint, metodo, payload);
      return { encolada: true };
    }
    throw err;
  }
}

/** Se llama una vez, al arrancar la app (ver _layout.tsx) -- procesa lo que hubiera
 * quedado pendiente de una sesión anterior y se queda escuchando cambios de red para
 * despachar la cola en cuanto vuelva la conexión. */
export function iniciarDespachoAutomatico(): () => void {
  procesarCola();
  const dejarDeEscuchar = NetInfo.addEventListener((estado) => {
    if (estado.isConnected === true && estado.isInternetReachable !== false) {
      procesarCola();
    }
  });
  return dejarDeEscuchar;
}
