"""Cliente HTTP compartido para llamar a WBD (la web) desde el backend de NINUMAPP
-- mismo secreto compartido (NINUMAPP_API_SECRET) que ya usan entre sí, aquí como
cabecera X-Notificaciones-Secret. Antes cada función de pedidos.py/avisos.py que
llamaba a WBD repetía a mano el mismo bloque de construir cliente/cabecera/
try-except (revisión de calidad de código, 2026-08-27)."""

import httpx

from app.config import settings


def configurada() -> bool:
    return bool(settings.ninumapp_api_secret)


async def peticion(metodo: str, ruta: str, *, timeout: int = 15, **kwargs) -> httpx.Response | None:
    """None si WBD no está configurado o la llamada falla en la red -- un status de
    error (4xx/5xx) sí llega como Response normal, cada llamador decide qué hacer
    con eso (igual que antes de esta extracción)."""
    if not configurada():
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as cliente:
            return await cliente.request(
                metodo,
                f"{settings.wbd_url.rstrip('/')}{ruta}",
                headers={"X-Notificaciones-Secret": settings.ninumapp_api_secret},
                **kwargs,
            )
    except httpx.HTTPError:
        return None
