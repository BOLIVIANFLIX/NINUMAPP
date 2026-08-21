"""Resumen del mes para la pantalla Inicio.

Dos fuentes distintas, cada una con su propio "conectado":
- Pedidos confirmados de la tienda web: Supabase de solo lectura (rol
  ninumapp_lectura), igual que pedidos.py/avisos.py.
- Ingresos, facturas pendientes, acumulado sin facturar y gastos: viven en la SQLite +
  CSV de contabilidad de ninuma-agente (proyecto aparte, Raspberry) -- mismas cifras y
  misma lógica que panel._seccion_inicio, leídas vía panel_agente.py. NINUMAPP nunca
  calcula estos números por su cuenta ni escribe nada ahí."""

from datetime import datetime, timezone
from typing import TypedDict

import asyncpg

from app.services import panel_agente, supabase_db
from app.services.avisos import solicitudes_pendientes

_CONSULTA = """
select
  coalesce(sum(o.total_cents), 0) as ingresos_cents,
  count(*) as pedidos_confirmados
from orders o
where o.created_at >= $1
  and (o.kind = 'b2b' or o.payment_status = 'pagado' or o.fecha_confirmada_por_operador)
"""


class ResumenMes(TypedDict):
    pedidos_confirmados_mes: int
    solicitudes_pendientes: int
    financiero: panel_agente.ResumenFinanciero | None
    financiero_conectado: bool


async def resumen_mes() -> tuple[ResumenMes | None, bool]:
    """Devuelve (resumen, conectado) -- "conectado" aquí se refiere a Supabase (la
    parte de pedidos de la tienda); la parte financiera trae su propio flag
    `financiero_conectado` porque depende de una integración aparte."""
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
    financiero, financiero_conectado = await panel_agente.resumen_financiero()

    return ResumenMes(
        pedidos_confirmados_mes=fila["pedidos_confirmados"],
        solicitudes_pendientes=len(solicitudes),
        financiero=financiero,
        financiero_conectado=financiero_conectado,
    ), True
