"""Resumen del mes para la pantalla Inicio -- misma conexión de solo lectura a
Supabase que pedidos.py/avisos.py (rol ninumapp_lectura).

"Ingresos" se muestra CON IVA a propósito: total_cents es lo que paga el cliente
(precio final), y convertirlo a "sin IVA" exige saber qué tipo aplica a cada
producto (puede no ser uniforme) -- no está verificado con Ariadna todavía, así que
mostrar un número "sin IVA" adivinado sería peor que no mostrarlo. Se etiqueta "con
IVA" en vez de fingir precisión que no hay."""

from datetime import datetime, timezone
from typing import TypedDict

import asyncpg

from app.services import supabase_db
from app.services.avisos import solicitudes_pendientes

_CONSULTA = """
select
  coalesce(sum(o.total_cents), 0) as ingresos_cents,
  count(*) as pedidos_confirmados,
  count(*) filter (where o.payment_status is distinct from 'pagado') as pendientes_cobro
from orders o
where o.created_at >= $1
  and (o.kind = 'b2b' or o.payment_status = 'pagado' or o.fecha_confirmada_por_operador)
"""


class ResumenMes(TypedDict):
    ingresos_con_iva_mes: float
    pedidos_confirmados_mes: int
    facturas_pendientes_cobro: int
    solicitudes_pendientes: int


async def resumen_mes() -> tuple[ResumenMes | None, bool]:
    """Devuelve (resumen, conectado)."""
    if not supabase_db.configurada():
        return None, False

    ahora = datetime.now(timezone.utc)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    try:
        conn = await supabase_db.conectar()
    except (OSError, asyncpg.PostgresError):
        return None, False

    try:
        fila = await conn.fetchrow(_CONSULTA, inicio_mes)
    finally:
        await conn.close()

    solicitudes, _ = await solicitudes_pendientes()

    return ResumenMes(
        ingresos_con_iva_mes=fila["ingresos_cents"] / 100,
        pedidos_confirmados_mes=fila["pedidos_confirmados"],
        facturas_pendientes_cobro=fila["pendientes_cobro"],
        solicitudes_pendientes=len(solicitudes),
    ), True
