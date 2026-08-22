"""Gestión de usuarios del panel de ninuma-agente (ninuma-bot.tunga.es/panel) -- no
tiene nada que ver con el login propio de NINUMAPP (ver routers/auth.py), son cuentas
de sitios distintos. Reutiliza tal cual auth.py de ninuma-agente (mismo hash/salt,
misma validación de contraseña), nunca reimplementado aquí."""

import functools

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/usuarios-panel", tags=["usuarios-panel"])


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
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.usuarios_panel()
    return {
        "usuarios": lista,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }


class CrearUsuarioBody(BaseModel):
    usuario: str
    password: str


@router.post("/crear")
@_manejar_error
async def crear(body: CrearUsuarioBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.crear_usuario_panel(body.usuario, body.password)


class UsuarioBody(BaseModel):
    usuario: str


@router.post("/eliminar")
@_manejar_error
async def eliminar(body: UsuarioBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.eliminar_usuario_panel(body.usuario)


@router.post("/cerrar-sesion")
@_manejar_error
async def cerrar_sesion(body: UsuarioBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.cerrar_sesion_usuario_panel(body.usuario)
    return {"ok": True}


class CambiarPasswordBody(BaseModel):
    usuario: str
    password: str


@router.post("/cambiar-password")
@_manejar_error
async def cambiar_password(body: CambiarPasswordBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cambiar_password_usuario_panel(body.usuario, body.password)
