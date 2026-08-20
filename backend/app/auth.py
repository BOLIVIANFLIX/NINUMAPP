"""Autenticación de NINUMAPP -- código propio, independiente del auth.py de
ninuma-agente, pero con el mismo nivel de seguridad ya auditado ahí el 2026-08-19:
bloqueo tras varios intentos fallidos (por usuario Y global, para frenar fuerza bruta
contra usuarios distintos), comprobación en tiempo constante aunque el usuario no
exista (para no filtrar qué usuarios hay por la diferencia de tiempo de respuesta), y
doble factor (TOTP) obligatorio antes de crear una sesión real."""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import pyotp
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import IntentoFallido, LoginPendiente, Sesion, Usuario

_CLAVE_GLOBAL = "__global__"
LOGIN_PENDIENTE_MINUTOS = 5

# bcrypt trunca en 72 bytes -- se corta explícitamente en vez de dejar que falle o
# (peor) que trunque en un punto distinto al comparar luego.
_MAX_BYTES_PASSWORD = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:_MAX_BYTES_PASSWORD], bcrypt.gensalt()).decode("ascii")


def verificar_password(password: str, hash_: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8")[:_MAX_BYTES_PASSWORD], hash_.encode("ascii"))


def generar_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, usuario: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=usuario, issuer_name="NINUMAPP")


def verificar_totp(secret: str, codigo: str) -> bool:
    return pyotp.TOTP(secret).verify(codigo, valid_window=1)


async def _n_intentos_recientes(db: AsyncSession, clave: str) -> int:
    desde = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=settings.login_ventana_minutos)
    resultado = await db.execute(
        select(func.count()).select_from(IntentoFallido).where(IntentoFallido.clave == clave, IntentoFallido.creado_en >= desde)
    )
    return resultado.scalar_one()


async def bloqueado(db: AsyncSession, usuario: str) -> bool:
    por_usuario = await _n_intentos_recientes(db, usuario.strip().lower())
    global_ = await _n_intentos_recientes(db, _CLAVE_GLOBAL)
    return por_usuario >= settings.login_max_intentos or global_ >= settings.login_max_intentos * 4


async def registrar_intento_fallido(db: AsyncSession, usuario: str) -> None:
    db.add(IntentoFallido(clave=usuario.strip().lower()))
    db.add(IntentoFallido(clave=_CLAVE_GLOBAL))
    await db.commit()


async def obtener_usuario(db: AsyncSession, usuario: str) -> Usuario | None:
    resultado = await db.execute(select(Usuario).where(Usuario.usuario == usuario.strip().lower()))
    return resultado.scalar_one_or_none()


async def iniciar_sesion(db: AsyncSession, usuario: str, password: str) -> dict:
    """Primer paso: usuario+contraseña. Nunca revela si el usuario existe o no --
    tanto si existe como si no, se hace un hash (siempre el mismo coste) antes de
    responder, para que la respuesta tarde lo mismo en los dos casos."""
    if await bloqueado(db, usuario):
        return {"ok": False, "motivo": "bloqueado"}

    fila = await obtener_usuario(db, usuario)
    if not fila:
        hash_password(password)  # mismo coste que un hash real -- tiempo constante
        await registrar_intento_fallido(db, usuario)
        return {"ok": False, "motivo": "credenciales"}

    if not verificar_password(password, fila.password_hash):
        await registrar_intento_fallido(db, usuario)
        return {"ok": False, "motivo": "credenciales"}

    configurando_totp = fila.totp_secret is None
    pendiente = LoginPendiente(usuario_id=fila.id, configurando_totp=configurando_totp)
    db.add(pendiente)
    await db.commit()

    resultado = {"ok": True, "token_pendiente": pendiente.token_pendiente, "configurando_totp": configurando_totp}
    if configurando_totp:
        secret = generar_totp_secret()
        fila.totp_secret = secret  # se confirma de verdad en verificar_totp_pendiente
        await db.commit()
        resultado["totp_uri"] = totp_uri(secret, fila.usuario)
    return resultado


async def _login_pendiente_valido(db: AsyncSession, token_pendiente: str) -> LoginPendiente | None:
    resultado = await db.execute(select(LoginPendiente).where(LoginPendiente.token_pendiente == token_pendiente))
    pendiente = resultado.scalar_one_or_none()
    if not pendiente:
        return None
    limite = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=LOGIN_PENDIENTE_MINUTOS)
    if pendiente.creado_en < limite:
        return None
    return pendiente


async def verificar_totp_pendiente(db: AsyncSession, token_pendiente: str, codigo: str, dispositivo: str | None) -> dict:
    pendiente = await _login_pendiente_valido(db, token_pendiente)
    if not pendiente:
        return {"ok": False, "motivo": "token_invalido"}

    resultado = await db.execute(select(Usuario).where(Usuario.id == pendiente.usuario_id))
    fila = resultado.scalar_one_or_none()
    if not fila or await bloqueado(db, fila.usuario):
        return {"ok": False, "motivo": "bloqueado"}

    if not fila.totp_secret or not verificar_totp(fila.totp_secret, codigo):
        await registrar_intento_fallido(db, fila.usuario)
        return {"ok": False, "motivo": "codigo_incorrecto"}

    sesion = Sesion(usuario_id=fila.id, dispositivo=dispositivo)
    db.add(sesion)
    await db.execute(delete(LoginPendiente).where(LoginPendiente.token_pendiente == token_pendiente))
    await db.commit()
    return {"ok": True, "token_sesion": sesion.token}


async def usuario_de_sesion(db: AsyncSession, token: str) -> Usuario | None:
    resultado = await db.execute(select(Sesion).where(Sesion.token == token))
    sesion = resultado.scalar_one_or_none()
    if not sesion:
        return None
    resultado = await db.execute(select(Usuario).where(Usuario.id == sesion.usuario_id))
    return resultado.scalar_one_or_none()


async def crear_usuario(db: AsyncSession, usuario: str, password: str) -> Usuario:
    fila = Usuario(usuario=usuario.strip().lower(), password_hash=hash_password(password))
    db.add(fila)
    await db.commit()
    await db.refresh(fila)
    return fila
