"""Ingresos y gastos -- réplica de /panel/ingresos, mes navegable + gastos fijos
manuales, mismas funciones de ninuma-agente vía panel_agente."""

import functools

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/ingresos", tags=["ingresos"])


def _manejar_error(f):
    @functools.wraps(f)
    async def envoltura(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except PanelAgenteError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return envoltura


@router.get("")
@_manejar_error
async def del_mes(mes: str | None = None, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.ingresos_del_mes(mes)


class CrearGastoBody(BaseModel):
    categoria: str
    importe: float
    fecha: str
    descripcion: str | None = None
    lugar_compra: str | None = None
    producto: str | None = None
    recurrente: bool = False
    pagado: bool = True


@router.post("/gastos/crear")
@_manejar_error
async def crear_gasto(body: CrearGastoBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.crear_gasto(
        body.categoria, body.importe, body.fecha, body.descripcion,
        body.lugar_compra, body.producto, body.recurrente, body.pagado,
    )


class GastoIdBody(BaseModel):
    id: int


@router.post("/gastos/eliminar")
@_manejar_error
async def eliminar_gasto(body: GastoIdBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.eliminar_gasto(body.id)


@router.post("/gastos/marcar-pagado")
@_manejar_error
async def marcar_pagado(body: GastoIdBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.marcar_gasto_pagado(body.id)
