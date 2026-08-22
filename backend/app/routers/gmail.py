from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import gmail as gmail_service
from app.services import google_auth

router = APIRouter(prefix="/api/gmail", tags=["gmail"])


@router.get("/auth-url")
async def auth_url(usuario: Usuario = Depends(usuario_actual)):
    """Solo para la autorización inicial única -- ver services/google_auth.py
    (cubre Gmail y Calendar en un mismo permiso). No forma parte del uso normal de la app."""
    return {"url": google_auth.construir_url_autorizacion()}


@router.get("/callback")
async def callback(code: str | None = None, error: str | None = None):
    """Google redirige aquí tras el consentimiento -- sin autenticación (Google no
    manda el Bearer token de NINUMAPP). Solo muestra el código para copiarlo a mano;
    el intercambio por el refresh_token se hace aparte, una única vez, no aquí."""
    if error:
        return {"error": error}
    return {"code": code, "siguiente_paso": "Copia este código y pégaselo a quien esté configurando NINUMAPP."}


@router.get("/correos-pendientes")
async def correos_pendientes(usuario: Usuario = Depends(usuario_actual)):
    correos, conectado = await gmail_service.correos_pendientes()
    return {
        "correos": correos,
        "conectado": conectado,
        "aviso": None if conectado else "Gmail todavía no está conectado en NINUMAPP.",
    }
