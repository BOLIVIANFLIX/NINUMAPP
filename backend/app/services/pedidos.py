"""Lectura de pedidos desde la Supabase de la web (proyecto NINUMAWEB/WBD, fuera de
este repo) -- vía el rol dedicado y de solo lectura `ninumapp_lectura` (ver
WBD/supabase/migrations/038_rol_lectura_ninumapp.sql), nunca la service_role key.
Conexión directa por asyncpg, no PostgREST -- mismo motivo que ninuma-agente: el
rol ya trae sus propios límites por RLS/GRANT, no hace falta nada más encima.

Si supabase_db_host no está configurado, o la conexión falla, se devuelve una lista
vacía con `conectado=False` en vez de reventar -- igual que HA/Grocy, esta sección se
queda "sin datos" sin tumbar el resto de la app."""

import logging
from datetime import datetime
from typing import TypedDict

import asyncpg
import httpx

from app.config import settings
from app.services import supabase_db

logger = logging.getLogger(__name__)


class Pedido(TypedDict):
    id: str
    status: str
    creado_en: datetime
    total_cents: int
    locator: str | None
    kind: str
    recogida_fecha: datetime | None
    payment_status: str | None
    descripcion: str | None
    cliente: str
    guest_telefono: str | None
    nif: str | None
    es_empresa: bool | None
    es_cena: bool


_CONSULTA = """
select
  o.id, o.status, o.created_at, o.total_cents, o.locator, o.kind,
  o.recogida_fecha, o.payment_status, o.description, o.guest_nombre,
  o.guest_telefono, o.nif, o.es_empresa, o.es_cena, p.full_name, p.company_name
from orders o
left join profiles p on p.id = o.user_id
where o.kind = 'b2b'
   or o.payment_status = 'pagado'
   or o.fecha_confirmada_por_operador
order by o.created_at desc
limit 200
"""


async def pedidos_confirmados() -> tuple[list[Pedido], bool]:
    """Devuelve (pedidos, conectado). B2B (confirmados por construcción, ver
    NINUMAWEB) + cualquier pedido (encargo, tienda, edición) con pago recibido o
    confirmado a mano por Ariadna -- nunca solicitudes sin revisar ni sin pagar."""
    if not supabase_db.configurada():
        return [], False

    try:
        conn = await supabase_db.conectar()
    except (OSError, asyncpg.PostgresError):
        logger.exception("No se ha podido conectar a Supabase para pedidos_confirmados()")
        return [], False

    try:
        filas = await conn.fetch(_CONSULTA)
    finally:
        await conn.close()

    return [
        Pedido(
            id=str(fila["id"]),
            status=fila["status"],
            creado_en=fila["created_at"],
            total_cents=fila["total_cents"],
            locator=fila["locator"],
            kind=fila["kind"],
            recogida_fecha=fila["recogida_fecha"],
            payment_status=fila["payment_status"],
            descripcion=fila["description"],
            cliente=fila["company_name"] or fila["full_name"] or fila["guest_nombre"] or "Sin nombre",
            guest_telefono=fila["guest_telefono"],
            nif=fila["nif"],
            es_empresa=fila["es_empresa"],
            es_cena=fila["es_cena"],
        )
        for fila in filas
    ], True


class AdjuntoPedido(TypedDict):
    id: str
    tipo: str
    nombre: str
    creadoEn: str
    url: str | None


class ResultadoAccionPedido(TypedDict):
    ok: bool
    status: str | None


# ---------------------------------------------------------------------------
# Mismas acciones que ya ofrece el bot de Telegram en la ficha completa de un
# pedido confirmado (➡️ Pasar a Entregado, 💰 Marcar pagado, 📎 Adjuntar foto/PDF,
# 🖼 Ver adjuntos) -- Ariadna, 2026-08-25: quiere las mismas opciones desde NINUMAPP
# en Pedidos > Particulares. NINUMAPP solo tiene lectura en Supabase (rol
# ninumapp_lectura), así que estas acciones pasan por WBD (mismo patrón que
# services/avisos.py.editar_solicitud), vía los endpoints /api/ninumapp-pedido-*
# con el secreto compartido NINUMAPP_API_SECRET.
# ---------------------------------------------------------------------------


async def pedido_accion(order_id: str, accion: str) -> ResultadoAccionPedido:
    if not settings.ninumapp_api_secret:
        return {"ok": False, "status": None}
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            resp = await cliente.post(
                f"{settings.wbd_url.rstrip('/')}/api/ninumapp-pedido-accion",
                headers={"X-Notificaciones-Secret": settings.ninumapp_api_secret, "Content-Type": "application/json"},
                json={"orderId": order_id, "accion": accion},
            )
            if resp.status_code != 200:
                return {"ok": False, "status": None}
            datos = resp.json()
            return {"ok": True, "status": datos.get("status")}
    except httpx.HTTPError:
        return {"ok": False, "status": None}


async def pedido_adjuntos_listar(order_id: str) -> list[AdjuntoPedido]:
    if not settings.ninumapp_api_secret:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            resp = await cliente.get(
                f"{settings.wbd_url.rstrip('/')}/api/ninumapp-pedido-adjuntos",
                headers={"X-Notificaciones-Secret": settings.ninumapp_api_secret},
                params={"orderId": order_id},
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("adjuntos", [])
    except httpx.HTTPError:
        return []


async def pedido_adjunto_subir(order_id: str, tipo: str, nombre_archivo: str, contenido: bytes, content_type: str) -> bool:
    if not settings.ninumapp_api_secret:
        return False
    try:
        async with httpx.AsyncClient(timeout=30) as cliente:
            resp = await cliente.post(
                f"{settings.wbd_url.rstrip('/')}/api/ninumapp-pedido-adjuntos",
                headers={"X-Notificaciones-Secret": settings.ninumapp_api_secret},
                data={"orderId": order_id, "tipo": tipo},
                files={"file": (nombre_archivo, contenido, content_type)},
            )
            return resp.status_code == 200
    except httpx.HTTPError:
        return False
