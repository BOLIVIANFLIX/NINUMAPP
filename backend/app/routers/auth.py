from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import auth
from app.database import get_db
from app.models import Usuario

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    usuario: str
    password: str


class TotpBody(BaseModel):
    token_pendiente: str
    codigo: str
    dispositivo: str | None = None


class RefreshBody(BaseModel):
    refresh_token: str
    dispositivo: str | None = None


class LogoutBody(BaseModel):
    refresh_token: str


@router.post("/login")
async def login(body: LoginBody, db: AsyncSession = Depends(get_db)):
    resultado = await auth.iniciar_sesion(db, body.usuario, body.password)
    if not resultado["ok"]:
        # Mismo mensaje genérico tanto si el usuario no existe como si la contraseña
        # es incorrecta o está bloqueado -- no da pistas de cuál es el caso.
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos, o demasiados intentos.")
    return resultado


@router.post("/totp/verificar")
async def totp_verificar(body: TotpBody, db: AsyncSession = Depends(get_db)):
    resultado = await auth.verificar_totp_pendiente(db, body.token_pendiente, body.codigo, body.dispositivo)
    if not resultado["ok"]:
        raise HTTPException(status_code=401, detail="Código incorrecto o caducado.")
    return resultado


@router.post("/refresh")
async def refresh(body: RefreshBody, db: AsyncSession = Depends(get_db)):
    """Canjea el refresh token guardado en el móvil (desbloqueado con biometría) por
    un access token nuevo -- sin volver a pedir usuario/contraseña/TOTP. El propio
    refresh token se rota (ver auth.refrescar_token): la app SIEMPRE debe guardar el
    refresh_token nuevo que devuelve esta respuesta, el anterior deja de servir."""
    resultado = await auth.refrescar_token(db, body.refresh_token, body.dispositivo)
    if not resultado["ok"]:
        raise HTTPException(status_code=401, detail="Sesión no válida, inicia sesión de nuevo.")
    return resultado


@router.post("/logout")
async def logout(body: LogoutBody, db: AsyncSession = Depends(get_db)):
    await auth.revocar_refresh_token(db, body.refresh_token)
    return {"ok": True}


async def usuario_actual(authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> Usuario:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Falta iniciar sesión.")
    token = authorization.removeprefix("Bearer ").strip()
    usuario_id = auth.usuario_id_de_access_token(token)
    if not usuario_id:
        raise HTTPException(status_code=401, detail="Sesión caducada, renueva o inicia sesión de nuevo.")
    fila = await auth.usuario_de_id(db, usuario_id)
    if not fila:
        raise HTTPException(status_code=401, detail="Sesión no válida.")
    return fila
