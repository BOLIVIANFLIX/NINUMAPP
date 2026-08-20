"""Clientes propios de NINUMAPP -- CRUD directo sobre la base de datos propia (ver
app/models.py:Cliente), independiente de la Supabase de la web a propósito."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente, Usuario
from app.routers.auth import usuario_actual

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


class ClienteBody(BaseModel):
    nombre: str
    empresa: str | None = None
    telefono: str | None = None
    email: str | None = None
    nif: str | None = None
    notas: str | None = None


class ClienteResumen(BaseModel):
    id: str
    nombre: str
    empresa: str | None
    telefono: str | None
    email: str | None
    nif: str | None
    notas: str | None
    creado_en: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[ClienteResumen])
async def listar(usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    filas = await db.execute(select(Cliente).order_by(Cliente.nombre))
    return filas.scalars().all()


@router.post("", response_model=ClienteResumen)
async def crear(body: ClienteBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    await db.commit()
    await db.refresh(cliente)
    return cliente


@router.put("/{cliente_id}", response_model=ClienteResumen)
async def actualizar(cliente_id: str, body: ClienteBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    cliente = await db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    for campo, valor in body.model_dump().items():
        setattr(cliente, campo, valor)
    await db.commit()
    await db.refresh(cliente)
    return cliente
