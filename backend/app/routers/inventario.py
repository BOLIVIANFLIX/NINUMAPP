from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import inventario

router = APIRouter(prefix="/api/inventario", tags=["inventario"])


@router.post("/ticket/escanear")
async def escanear_ticket(imagen: UploadFile = File(...), usuario: Usuario = Depends(usuario_actual)):
    lineas, ok = await inventario.procesar_ticket(await imagen.read(), imagen.content_type or "image/jpeg")
    if not ok:
        raise HTTPException(status_code=503, detail="No se ha podido leer el ticket (Gemini/Grocy no disponible).")
    return {"lineas": lineas}


class LineaTicketConfirmada(BaseModel):
    producto_id: int
    cantidad: float
    precio_unitario: float | None = None


class ConfirmarTicketBody(BaseModel):
    lineas: list[LineaTicketConfirmada]


@router.post("/ticket/confirmar")
async def confirmar_ticket(body: ConfirmarTicketBody, usuario: Usuario = Depends(usuario_actual)):
    await inventario.confirmar_ticket([linea.model_dump() for linea in body.lineas])
    return {"ok": True}


@router.post("/albaran/escanear")
async def escanear_albaran(imagen: UploadFile = File(...), usuario: Usuario = Depends(usuario_actual)):
    lineas, ok = await inventario.procesar_albaran(await imagen.read(), imagen.content_type or "image/jpeg")
    if not ok:
        raise HTTPException(status_code=503, detail="No se ha podido leer el albarán (Gemini/Grocy no disponible).")
    return {"lineas": lineas}


class LineaAlbaranConfirmada(BaseModel):
    receta_id: int
    cantidad: float


class ConfirmarAlbaranBody(BaseModel):
    lineas: list[LineaAlbaranConfirmada]


@router.post("/albaran/confirmar")
async def confirmar_albaran(body: ConfirmarAlbaranBody, usuario: Usuario = Depends(usuario_actual)):
    await inventario.confirmar_albaran([linea.model_dump() for linea in body.lineas])
    return {"ok": True}
