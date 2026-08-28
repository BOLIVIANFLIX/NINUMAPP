"""Precio público de la tienda online -- editable desde aquí sin tocar el contenido
markdown de la web (WBD). El precio real que se cobra en el checkout de Stripe ya
consulta este mismo override (ver WBD/src/pages/api/crear-sesion-pago.ts)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.errores import manejar_error as _manejar_error
from app.routers.estado_conexion import con_estado
from app.services import panel_agente

router = APIRouter(prefix="/api/precios-tienda", tags=["precios-tienda"])


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.precios_tienda_online()
    return con_estado(conectado, "La web todavía no está conectada para precios (o ninuma-agente no responde).", precios=lista)


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
    return con_estado(conectado, "La web todavía no está conectada para el catálogo (o ninuma-agente no responde).", piezas=lista)
