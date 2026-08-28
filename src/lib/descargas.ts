/** Descarga un archivo protegido (Bearer del usuario logueado) a la caché local y,
 * si el selector nativo está disponible, lo comparte -- mismo bloque repetido tal
 * cual en 5 pantallas (asistente de albarán, confirmar Grand Folies, confirmar
 * pedido B2B, compartir QR de una edición, descargar tickets de un trimestre).
 * Revisión de calidad de código, 2026-08-27. */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { tokenStore } from '@/lib/token-store';

export async function descargarACache(url: string, nombreArchivo: string): Promise<File> {
  const token = tokenStore.getAccessToken();
  const destino = new File(Paths.cache, nombreArchivo);
  return File.downloadFileAsync(url, destino, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    idempotent: true,
  });
}

export async function descargarYCompartir(url: string, nombreArchivo: string): Promise<void> {
  const archivo = await descargarACache(url, nombreArchivo);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri);
  }
}
