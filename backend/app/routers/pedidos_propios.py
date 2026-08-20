"""Pedidos creados a mano desde NINUMAPP (ver app/models.py:PedidoPropio) --
independiente de los pedidos reales de la web (esos los sirve routers/pedidos.py,
de solo lectura contra Supabase). Nombre de ruta distinto a propósito para que
nunca se confundan los dos orígenes de datos."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Cliente, PedidoPropio, Usuario
from app.routers.auth import usuario_actual

router = APIRouter(prefix="/api/pedidos-propios", tags=["pedidos-propios"])

ESTADOS_VALIDOS = ("pendiente", "confirmado", "entregado", "cobrado")


class PedidoPropioBody(BaseModel):
    cliente_id: str
    descripcion: str
    total_cents: int = 0
    fecha_entrega: datetime | None = None
    estado: str = "pendiente"


class PedidoPropioResumen(BaseModel):
    id: str
    cliente_id: str
    cliente_nombre: str
    descripcion: str
    total_cents: int
    fecha_entrega: datetime | None
    estado: str
    creado_en: datetime


def _a_resumen(pedido: PedidoPropio) -> PedidoPropioResumen:
    return PedidoPropioResumen(
        id=pedido.id,
        cliente_id=pedido.cliente_id,
        cliente_nombre=pedido.cliente.nombre,
        descripcion=pedido.descripcion,
        total_cents=pedido.total_cents,
        fecha_entrega=pedido.fecha_entrega,
        estado=pedido.estado,
        creado_en=pedido.creado_en,
    )


def _validar_estado(estado: str) -> None:
    if estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido, debe ser uno de: {', '.join(ESTADOS_VALIDOS)}.")


@router.get("", response_model=list[PedidoPropioResumen])
async def listar(usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    filas = await db.execute(
        select(PedidoPropio).options(selectinload(PedidoPropio.cliente)).order_by(PedidoPropio.creado_en.desc())
    )
    return [_a_resumen(p) for p in filas.scalars().all()]


@router.post("", response_model=PedidoPropioResumen)
async def crear(body: PedidoPropioBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    _validar_estado(body.estado)
    if await db.get(Cliente, body.cliente_id) is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    pedido = PedidoPropio(**body.model_dump())
    db.add(pedido)
    await db.commit()
    await db.refresh(pedido, attribute_names=["cliente"])
    return _a_resumen(pedido)


@router.put("/{pedido_id}", response_model=PedidoPropioResumen)
async def actualizar(pedido_id: str, body: PedidoPropioBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    _validar_estado(body.estado)
    pedido = await db.get(PedidoPropio, pedido_id, options=[selectinload(PedidoPropio.cliente)])
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    for campo, valor in body.model_dump().items():
        setattr(pedido, campo, valor)
    await db.commit()
    await db.refresh(pedido, attribute_names=["cliente"])
    return _a_resumen(pedido)
