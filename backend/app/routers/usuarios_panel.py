"""Gestión de usuarios del panel de ninuma-agente (ninuma-bot.tunga.es/panel) -- no
tiene nada que ver con el login propio de NINUMAPP (ver routers/auth.py), son cuentas
de sitios distintos. Reutiliza tal cual auth.py de ninuma-agente (mismo hash/salt,
misma validación de contraseña), nunca reimplementado aquí."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.errores import manejar_error as _manejar_error
from app.routers.estado_conexion import con_estado
from app.services import panel_agente

router = APIRouter(prefix="/api/usuarios-panel", tags=["usuarios-panel"])


@router.get("")
@_manejar_error
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.usuarios_panel()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", usuarios=lista)


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
