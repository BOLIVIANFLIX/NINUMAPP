"""Decorador compartido por los routers que llaman a panel_agente (ninuma-agente) --
antes vivía copiado idéntico en 7 routers (analisis, avisos, ingresos, inventario,
pedidos_b2b, precios_tienda, usuarios_panel); revisión de calidad de código,
2026-08-27."""

import functools

from fastapi import HTTPException

from app.services.panel_agente import PanelAgenteError


def manejar_error(f):
    # functools.wraps deja __wrapped__ apuntando a f -- FastAPI usa inspect.signature
    # para leer los parámetros y Depends() de la ruta, y eso sigue esa cadena, así que
    # necesita esto para no perder la firma real al envolver la función.
    @functools.wraps(f)
    async def envoltura(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except PanelAgenteError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return envoltura
