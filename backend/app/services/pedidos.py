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

from app.services import supabase_db, wbd

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
    guest_email: str | None
    guest_telefono: str | None
    nif: str | None
    es_empresa: bool | None
    es_cena: bool


_CONSULTA = """
select
  o.id, o.status, o.created_at, o.total_cents, o.locator, o.kind,
  o.recogida_fecha, o.payment_status, o.description, o.guest_nombre,
  o.guest_email, o.guest_telefono, o.nif, o.es_empresa, o.es_cena, p.full_name, p.company_name
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
        async with supabase_db.conexion() as conn:
            filas = await conn.fetch(_CONSULTA)
    except (OSError, asyncpg.PostgresError):
        logger.exception("No se ha podido conectar a Supabase para pedidos_confirmados()")
        return [], False

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
            # Para b2b el nombre de la empresa manda (company_name); para el resto,
            # el nombre de quien pagó de verdad en Stripe (guest_nombre) va primero
            # -- el perfil de la cuenta logueada puede ser otra persona (Ariadna,
            # 2026-08-25: mismo caso que en avisos.py, "NINUMA" en vez de "Ramiro").
            cliente=(
                (fila["company_name"] or fila["full_name"] or fila["guest_nombre"] or "Sin nombre")
                if fila["kind"] == "b2b"
                else (fila["guest_nombre"] or fila["company_name"] or fila["full_name"] or "Sin nombre")
            ),
            guest_email=fila["guest_email"],
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
    resp = await wbd.peticion("POST", "/api/ninumapp-pedido-accion", json={"orderId": order_id, "accion": accion})
    if resp is None or resp.status_code != 200:
        return {"ok": False, "status": None}
    return {"ok": True, "status": resp.json().get("status")}


async def pedido_adjuntos_listar(order_id: str) -> list[AdjuntoPedido]:
    resp = await wbd.peticion("GET", "/api/ninumapp-pedido-adjuntos", params={"orderId": order_id})
    if resp is None or resp.status_code != 200:
        return []
    return resp.json().get("adjuntos", [])


async def pedido_adjunto_subir(order_id: str, tipo: str, nombre_archivo: str, contenido: bytes, content_type: str) -> bool:
    resp = await wbd.peticion(
        "POST", "/api/ninumapp-pedido-adjuntos", timeout=30,
        data={"orderId": order_id, "tipo": tipo},
        files={"file": (nombre_archivo, contenido, content_type)},
    )
    return resp is not None and resp.status_code == 200


# ---------------------------------------------------------------------------
# Compradores de Ediciones Especiales -- Ariadna, 2026-08-25: "necesito un
# apartado donde ver el listado de la gente que se ha apuntado a la cena... y lo
# mismo para productos de ediciones... poder acceder a su QR y código". Se lee en
# dos pasadas (pedidos + sus líneas) en vez de un JOIN con agregación porque
# order_items.referencia es "{edicionSlug}:{cajaId}" para una edición (ver
# 039_precios_override.sql) -- de ahí se saca a qué edición pertenece cada línea,
# ya que `orders` no guarda el slug de la edición en ninguna columna propia.
# ---------------------------------------------------------------------------


class LineaEdicion(TypedDict):
    nombre: str
    unidades: int


class CompradorEdicion(TypedDict):
    id: str
    locator: str | None
    cliente: str
    guest_telefono: str | None
    total_cents: int
    recogida_fecha: datetime | None
    es_cena: bool
    checked_in_at: datetime | None
    creado_en: datetime
    edicion_slug: str | None
    lineas: list[LineaEdicion]


_CONSULTA_EDICIONES = """
select o.id, o.locator, o.total_cents, o.recogida_fecha, o.es_cena, o.checked_in_at,
       o.created_at, o.guest_nombre, o.guest_telefono, p.full_name, p.company_name
from orders o
left join profiles p on p.id = o.user_id
where o.kind = 'edicion'
order by o.created_at desc
limit 300
"""


async def compradores_ediciones() -> tuple[list[CompradorEdicion], bool]:
    """Devuelve (compradores, conectado)."""
    if not supabase_db.configurada():
        return [], False

    try:
        async with supabase_db.conexion() as conn:
            pedidos = await conn.fetch(_CONSULTA_EDICIONES)
            ids = [p["id"] for p in pedidos]
            lineas_por_pedido: dict[str, list[LineaEdicion]] = {}
            edicion_por_pedido: dict[str, str | None] = {}
            if ids:
                filas_items = await conn.fetch(
                    "select order_id, referencia, nombre, unidades from order_items where order_id = any($1::uuid[])",
                    ids,
                )
                for fila in filas_items:
                    oid = str(fila["order_id"])
                    lineas_por_pedido.setdefault(oid, []).append({"nombre": fila["nombre"], "unidades": fila["unidades"]})
                    if oid not in edicion_por_pedido:
                        referencia = fila["referencia"] or ""
                        edicion_por_pedido[oid] = referencia.split(":", 1)[0] if ":" in referencia else None
    except (OSError, asyncpg.PostgresError):
        logger.exception("No se ha podido conectar a Supabase para compradores_ediciones()")
        return [], False

    return [
        CompradorEdicion(
            id=str(p["id"]),
            locator=p["locator"],
            cliente=p["company_name"] or p["full_name"] or p["guest_nombre"] or "Sin nombre",
            guest_telefono=p["guest_telefono"],
            total_cents=p["total_cents"],
            recogida_fecha=p["recogida_fecha"],
            es_cena=p["es_cena"],
            checked_in_at=p["checked_in_at"],
            creado_en=p["created_at"],
            edicion_slug=edicion_por_pedido.get(str(p["id"])),
            lineas=lineas_por_pedido.get(str(p["id"]), []),
        )
        for p in pedidos
    ], True


async def pedido_qr(order_id: str) -> tuple[bytes, str] | None:
    resp = await wbd.peticion("GET", "/api/ninumapp-pedido-qr", params={"orderId": order_id})
    if resp is None or resp.status_code != 200:
        return None
    return resp.content, resp.headers.get("content-type", "image/png")
