"""Solicitudes de encargo que todavía no se han revisado -- ni pagadas ni confirmadas
a mano por Ariadna. Es el complemento de pedidos.pedidos_confirmados(): lo que ahí se
excluye a propósito (nunca mostrar solicitudes sin revisar como si fueran pedidos en
firme) es exactamente lo que aquí se muestra, para que no se pierda de vista.

Misma conexión de solo lectura que pedidos.py (rol ninumapp_lectura) -- ver ahí para
el porqué de la vía (session pooler, no la service_role key)."""

from datetime import datetime
from typing import TypedDict

import asyncpg

from app.services import supabase_db


class SolicitudPendiente(TypedDict):
    id: str
    creado_en: datetime
    descripcion: str | None
    cliente: str


_CONSULTA = """
select o.id, o.created_at, o.description, o.guest_nombre, p.full_name, p.company_name
from orders o
left join profiles p on p.id = o.user_id
where o.kind = 'encargo'
  and o.payment_status is distinct from 'pagado'
  and not o.fecha_confirmada_por_operador
order by o.created_at desc
"""


async def solicitudes_pendientes() -> tuple[list[SolicitudPendiente], bool]:
    """Devuelve (solicitudes, conectado)."""
    if not supabase_db.configurada():
        return [], False

    try:
        conn = await supabase_db.conectar()
    except (OSError, asyncpg.PostgresError):
        return [], False

    try:
        filas = await conn.fetch(_CONSULTA)
    finally:
        await conn.close()

    return [
        SolicitudPendiente(
            id=str(fila["id"]),
            creado_en=fila["created_at"],
            descripcion=fila["description"],
            cliente=fila["company_name"] or fila["full_name"] or fila["guest_nombre"] or "Sin nombre",
        )
        for fila in filas
    ], True
