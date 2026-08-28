"""Solicitudes de encargo que todavía no se han revisado -- ni pagadas ni confirmadas
a mano por Ariadna. Es el complemento de pedidos.pedidos_confirmados(): lo que ahí se
excluye a propósito (nunca mostrar solicitudes sin revisar como si fueran pedidos en
firme) es exactamente lo que aquí se muestra, para que no se pierda de vista.

Misma conexión de solo lectura que pedidos.py (rol ninumapp_lectura) -- ver ahí para
el porqué de la vía (session pooler, no la service_role key)."""

from datetime import datetime
from typing import TypedDict

import asyncpg

from app.services import supabase_db, wbd


class SolicitudPendiente(TypedDict):
    id: str
    creado_en: datetime
    descripcion: str | None
    cliente: str
    kind: str
    tipo_contacto: str | None
    payment_status: str | None
    recogida_fecha: str | None
    guest_email: str | None
    guest_telefono: str | None
    nif: str | None
    es_empresa: bool | None
    total_cents: int | None


# Hasta el 2026-08-24 esto solo miraba kind='encargo' -- tienda/edición nunca
# aparecían aquí porque siempre llegan con payment_status='pagado' (se cobran al
# momento en Stripe), así que ese filtro los excluía por diseño. Se apoyaban en un
# mecanismo aparte en ninuma-agente (revision_pedidos_web, por locator) que además
# descartaba en silencio cualquier pedido sin locator -- y locator es SIEMPRE null
# para kind='tienda' (ver WBD/src/lib/webhook-stripe.ts), así que ninguna compra de
# tienda llegaba nunca a ningún sitio revisable. Ariadna, 2026-08-24, probando una
# ronda de compras real: "en los pedidos hechos por tienda no me deja modificar
# nada", "con ediciones no me deja editar ningún dato". Se unifica: cualquier pedido
# (menos b2b, que tiene su propio flujo) sin `fecha_confirmada_por_operador` sale
# aquí, esté pagado o no -- guardarCampoOpcional ya marca esa columna para
# cualquier `kind` al confirmar una fecha (ver WBD/src/lib/telegram-pedidos.ts),
# así que un pedido pagado desaparece de esta lista en cuanto Ariadna confirma su
# fecha, igual que ya pasaba con encargo.
_CONSULTA = """
select o.id, o.created_at, o.kind, o.tipo_contacto, o.payment_status, o.description, o.guest_nombre,
       p.full_name, p.company_name, o.recogida_fecha, o.guest_email, o.guest_telefono,
       o.nif, o.es_empresa, o.total_cents
from orders o
left join profiles p on p.id = o.user_id
where o.kind <> 'b2b'
  and not o.fecha_confirmada_por_operador
order by o.created_at desc
"""


async def solicitudes_pendientes() -> tuple[list[SolicitudPendiente], bool]:
    """Devuelve (solicitudes, conectado)."""
    if not supabase_db.configurada():
        return [], False

    try:
        async with supabase_db.conexion() as conn:
            filas = await conn.fetch(_CONSULTA)
    except (OSError, asyncpg.PostgresError):
        return [], False

    return [
        SolicitudPendiente(
            id=str(fila["id"]),
            creado_en=fila["created_at"],
            descripcion=fila["description"],
            # guest_nombre primero (no company_name/full_name): es el nombre de
            # quien de verdad pagó en Stripe en ESE pedido concreto -- el perfil de
            # la cuenta logueada puede ser otra persona (Ariadna, 2026-08-25: Ramiro
            # compró con la sesión de Ariadna iniciada, y salía "NINUMA", el nombre
            # de perfil de ella, en vez de "Ramiro"). No hay pedidos kind='b2b' en
            # esta consulta (se excluyen aparte), así que no hace falta preferir
            # company_name aquí.
            cliente=fila["guest_nombre"] or fila["company_name"] or fila["full_name"] or "Sin nombre",
            kind=fila["kind"],
            tipo_contacto=fila["tipo_contacto"],
            payment_status=fila["payment_status"],
            recogida_fecha=fila["recogida_fecha"].isoformat() if fila["recogida_fecha"] else None,
            guest_email=fila["guest_email"],
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
    tipo_contacto: str | None = None,
) -> bool:
    """Edita una solicitud (kind='encargo') directamente en la web -- NINUMAPP no
    puede escribir en Supabase (rol ninumapp_lectura), así que pasa por WBD
    (/api/ninumapp-agendar), que hace lo mismo que ya hace el bot de Telegram al
    editar una ficha: guardarCampoOpcional/guardarEsEmpresa/guardarPrecio, y si hay
    fecha, marca fecha_confirmada_por_operador y sincroniza el calendario compartido
    (ver WBD/src/lib/telegram-pedidos.ts). Devuelve False sin lanzar si WBD no está
    configurado o la llamada falla -- el error ya lo maneja el router."""
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
    if tipo_contacto is not None:
        cuerpo["tipoContacto"] = tipo_contacto

    resp = await wbd.peticion("POST", "/api/ninumapp-agendar", json=cuerpo)
    return resp is not None and resp.status_code == 200


async def descartar_solicitud(order_id: str, tipo_contacto: str | None = None) -> bool:
    """Da por vista una solicitud de tipo "informacion" (una simple consulta, no un
    pedido) sin fecha ni sincronización de calendario -- Ariadna, 2026-08-28: "quiero
    indicarle al sistema que no la agende... con notificar en la app es suficiente,
    luego no ocupa día ni nada más en las bases de datos". Ver
    WBD/src/lib/telegram-pedidos.ts::descartarSolicitud."""
    cuerpo: dict = {"orderId": order_id, "descartar": True}
    if tipo_contacto is not None:
        cuerpo["tipoContacto"] = tipo_contacto
    resp = await wbd.peticion("POST", "/api/ninumapp-agendar", json=cuerpo)
    return resp is not None and resp.status_code == 200
