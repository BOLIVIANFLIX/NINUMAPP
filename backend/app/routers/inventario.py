"""Inventario -- réplica de /panel/obrador (sub-sección Inventario): un solo botón
de escaneo, la IA de ninuma-agente decide sola si es ticket de compra o albarán
propio (ver services/panel_agente.py). NINUMAPP nunca reimplementa esta
clasificación ni el descuento de stock -- todo pasa por ninuma-agente, igual que
albaranes/Grand Folies, para que quede en la contabilidad real."""

import functools

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/inventario", tags=["inventario"])

# Una foto de móvil normal pesa 1-8 MB -- 15 MB da margen de sobra sin dejar subir
# cualquier cosa. Content-Type lo manda el propio cliente (no es una garantía real,
# ninuma-agente/Gemini son quienes de verdad validan que sea una imagen legible),
# pero rechazar aquí lo que ya viene mal etiquetado evita gastar la llamada a la IA
# en basura.
_TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024


def _manejar_error(f):
    @functools.wraps(f)
    async def envoltura(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except PanelAgenteError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return envoltura


@router.post("/escanear")
@_manejar_error
async def escanear(imagen: UploadFile = File(...), usuario: Usuario = Depends(usuario_actual)):
    if not (imagen.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo tiene que ser una imagen.")

    contenido = await imagen.read()
    if len(contenido) > _TAMANO_MAXIMO_BYTES:
        raise HTTPException(status_code=400, detail="La imagen pesa demasiado (máximo 15 MB).")

    return await panel_agente.inventario_escanear(contenido, imagen.content_type or "image/jpeg")


class EscaneoIdBody(BaseModel):
    id: str


@router.post("/confirmar")
@_manejar_error
async def confirmar(body: EscaneoIdBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.inventario_confirmar(body.id)


@router.post("/descartar")
@_manejar_error
async def descartar(body: EscaneoIdBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.inventario_descartar(body.id)
    return {"ok": True}


@router.get("/stock-actual")
async def stock_actual(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.inventario_stock_actual()
    return {
        "stock": lista,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }


@router.get("/movimientos-recientes")
async def movimientos_recientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.inventario_movimientos_recientes()
    return {
        "movimientos": lista,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }
