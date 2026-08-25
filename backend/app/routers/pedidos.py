from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import avisos as avisos_service
from app.services import pedidos as pedidos_service

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await pedidos_service.pedidos_confirmados()
    return {
        "pedidos": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Supabase todavía no está conectado en NINUMAPP.",
    }


# ---------------------------------------------------------------------------
# Mismas acciones/ficha/adjuntos que ya ofrece el bot de Telegram para un pedido
# ya confirmado -- Ariadna, 2026-08-25.
# ---------------------------------------------------------------------------


class EditarFichaBody(BaseModel):
    fecha: str | None = None
    nombre: str | None = None
    telefono: str | None = None
    nif: str | None = None
    es_empresa: bool | None = None
    precio_cents: int | None = None


@router.post("/{order_id}/editar")
async def editar(order_id: str, body: EditarFichaBody, usuario: Usuario = Depends(usuario_actual)):
    ok = await avisos_service.editar_solicitud(
        order_id,
        fecha=body.fecha,
        nombre=body.nombre,
        telefono=body.telefono,
        nif=body.nif,
        es_empresa=body.es_empresa,
        precio_cents=body.precio_cents,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="No se ha podido guardar los cambios en la web.")
    return {"ok": True}


@router.post("/{order_id}/entregado")
async def marcar_entregado(order_id: str, usuario: Usuario = Depends(usuario_actual)):
    resultado = await pedidos_service.pedido_accion(order_id, "entregado")
    if not resultado["ok"]:
        raise HTTPException(status_code=502, detail="No se ha podido marcar como entregado.")
    return resultado


@router.post("/{order_id}/pagado")
async def marcar_pagado(order_id: str, usuario: Usuario = Depends(usuario_actual)):
    resultado = await pedidos_service.pedido_accion(order_id, "pagado")
    if not resultado["ok"]:
        raise HTTPException(status_code=502, detail="No se ha podido marcar como pagado.")
    return resultado


@router.get("/{order_id}/adjuntos")
async def adjuntos(order_id: str, usuario: Usuario = Depends(usuario_actual)):
    return {"adjuntos": await pedidos_service.pedido_adjuntos_listar(order_id)}


@router.post("/{order_id}/adjuntos")
async def subir_adjunto(
    order_id: str,
    tipo: str = Form(...),
    file: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_actual),
):
    if tipo not in ("pedido", "albaran"):
        raise HTTPException(status_code=400, detail='"tipo" debe ser "pedido" o "albaran".')
    contenido = await file.read()
    ok = await pedidos_service.pedido_adjunto_subir(
        order_id, tipo, file.filename or "archivo", contenido, file.content_type or "application/octet-stream"
    )
    if not ok:
        raise HTTPException(status_code=502, detail="No se ha podido subir el archivo.")
    return {"ok": True}
