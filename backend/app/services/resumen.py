"""Resumen del mes para la pantalla Inicio.

Dos fuentes distintas, cada una con su propio "conectado":
- Pedidos confirmados de la tienda web: Supabase de solo lectura (rol
  ninumapp_lectura), igual que pedidos.py/avisos.py.
- Ingresos, facturas pendientes, acumulado sin facturar y gastos: viven en la SQLite +
  CSV de contabilidad de ninuma-agente (proyecto aparte, Raspberry) -- mismas cifras y
  misma lógica que panel._seccion_inicio, leídas vía panel_agente.py. NINUMAPP nunca
  calcula estos números por su cuenta ni escribe nada ahí."""

import logging
from datetime import datetime, timezone
from typing import TypedDict

import asyncpg

from app.services import panel_agente, supabase_db

logger = logging.getLogger(__name__)

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
    financiero: panel_agente.ResumenFinanciero | None
    financiero_conectado: bool


async def resumen_mes() -> tuple[ResumenMes, bool]:
    """Devuelve (resumen, conectado_supabase) -- Supabase (pedidos de la tienda) y
    ninuma-agente (parte financiera, con su propio `financiero_conectado`) son
    integraciones independientes: si una falla, la otra sigue funcionando, nunca se
    apaga Inicio entero por un fallo puntual de Supabase."""
    pedidos_confirmados = 0
    conectado_supabase = False

    if supabase_db.configurada():
        try:
            conn = await supabase_db.conectar()
            try:
                ahora = datetime.now(timezone.utc)
                inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                fila = await conn.fetchrow(_CONSULTA, inicio_mes)
                pedidos_confirmados = fila["pedidos_confirmados"]
                conectado_supabase = True
            finally:
                await conn.close()
        except (OSError, asyncpg.PostgresError):
            logger.exception("No se ha podido conectar a Supabase para resumen_mes()")

    financiero, financiero_conectado = await panel_agente.resumen_financiero()

    return ResumenMes(
        pedidos_confirmados_mes=pedidos_confirmados,
        financiero=financiero,
        financiero_conectado=financiero_conectado,
    ), conectado_supabase
