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


_CONSULTA = """
select
  o.id, o.status, o.created_at, o.total_cents, o.locator, o.kind,
  o.recogida_fecha, o.payment_status, o.description, o.guest_nombre,
  p.full_name, p.company_name
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
        )
        for fila in filas
    ], True
