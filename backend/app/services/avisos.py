"""Solicitudes de encargo que todavía no se han revisado -- ni pagadas ni confirmadas
a mano por Ariadna. Es el complemento de pedidos.pedidos_confirmados(): lo que ahí se
excluye a propósito (nunca mostrar solicitudes sin revisar como si fueran pedidos en
firme) es exactamente lo que aquí se muestra, para que no se pierda de vista.

Misma conexión de solo lectura que pedidos.py (rol ninumapp_lectura) -- ver ahí para
el porqué de la vía (session pooler, no la service_role key)."""

from datetime import datetime
from typing import TypedDict

import asyncpg
import httpx

from app.config import settings
from app.services import supabase_db


class SolicitudPendiente(TypedDict):
    id: str
    creado_en: datetime
    descripcion: str | None
    cliente: str
    recogida_fecha: str | None
    guest_telefono: str | None
    nif: str | None
    es_empresa: bool | None
    total_cents: int | None


_CONSULTA = """
select o.id, o.created_at, o.description, o.guest_nombre, p.full_name, p.company_name,
       o.recogida_fecha, o.guest_telefono, o.nif, o.es_empresa, o.total_cents
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
            recogida_fecha=fila["recogida_fecha"].isoformat() if fila["recogida_fecha"] else None,
            guest_telefono=fila["guest_telefono"],
            nif=fila["nif"],
            es_empresa=fila["es_empresa"],
            total_cents=fila["total_cents"],
        )
        for fila in filas
    ], True


async def editar_solicitud(
    order_id: str,
    fecha: str | None = None,
    nombre: str | None = None,
    telefono: str | None = None,
    nif: str | None = None,
    es_empresa: bool | None = None,
    precio_cents: int | None = None,
) -> bool:
    """Edita una solicitud (kind='encargo') directamente en la web -- NINUMAPP no
    puede escribir en Supabase (rol ninumapp_lectura), así que pasa por WBD
    (/api/ninumapp-agendar), que hace lo mismo que ya hace el bot de Telegram al
    editar una ficha: guardarCampoOpcional/guardarEsEmpresa/guardarPrecio, y si hay
    fecha, marca fecha_confirmada_por_operador y sincroniza el calendario compartido
    (ver WBD/src/lib/telegram-pedidos.ts). Devuelve False sin lanzar si WBD no está
    configurado o la llamada falla -- el error ya lo maneja el router."""
    if not settings.ninumapp_api_secret:
        return False
    cuerpo: dict = {"orderId": order_id}
    if fecha is not None:
        cuerpo["fecha"] = fecha
    if nombre is not None:
        cuerpo["nombre"] = nombre
    if telefono is not None:
        cuerpo["telefono"] = telefono
    if nif is not None:
        cuerpo["nif"] = nif
    if es_empresa is not None:
        cuerpo["esEmpresa"] = es_empresa
    if precio_cents is not None:
        cuerpo["precioCents"] = precio_cents

    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            resp = await cliente.post(
                f"{settings.wbd_url.rstrip('/')}/api/ninumapp-agendar",
                headers={"X-Notificaciones-Secret": settings.ninumapp_api_secret, "Content-Type": "application/json"},
                json=cuerpo,
            )
            return resp.status_code == 200
    except httpx.HTTPError:
        return False
