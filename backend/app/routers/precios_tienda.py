"""Precio público de la tienda online -- editable desde aquí sin tocar el contenido
markdown de la web (WBD). El precio real que se cobra en el checkout de Stripe ya
consulta este mismo override (ver WBD/src/pages/api/crear-sesion-pago.ts)."""

import functools

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/precios-tienda", tags=["precios-tienda"])


def _manejar_error(f):
    @functools.wraps(f)
    async def envoltura(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except PanelAgenteError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return envoltura


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.precios_tienda_online()
    return {
        "precios": lista,
        "conectado": conectado,
        "aviso": None if conectado else "La web todavía no está conectada para precios (o ninuma-agente no responde).",
    }


class GuardarPrecioBody(BaseModel):
    referencia: str
    precio: float | None = None
    activo: bool | None = None


@router.post("/guardar")
@_manejar_error
async def guardar(body: GuardarPrecioBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.precio_tienda_guardar(body.referencia, body.precio, body.activo)


class ReferenciaBody(BaseModel):
    referencia: str


@router.post("/eliminar")
@_manejar_error
async def eliminar(body: ReferenciaBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.precio_tienda_eliminar(body.referencia)


@router.get("/catalogo")
async def catalogo(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.catalogo_tienda()
    return {
        "piezas": lista,
        "conectado": conectado,
        "aviso": None if conectado else "La web todavía no está conectada para el catálogo (o ninuma-agente no responde).",
    }
