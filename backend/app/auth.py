"""Autenticación de NINUMAPP -- código propio, independiente del auth.py de
ninuma-agente, con el mismo nivel de seguridad ya auditado ahí el 2026-08-19
(bloqueo tras varios intentos fallidos, tiempo constante, doble factor obligatorio),
más el modelo Access Token + Refresh Token acordado el 2026-08-20 para poder
desbloquear la app con biometría en vez de usuario+contraseña+TOTP cada vez.

Cómo encajan las dos piezas:
- Access Token: un JWT firmado, vive poco (ACCESS_TOKEN_MINUTOS) y NUNCA se guarda en
  base de datos -- se valida solo comprobando la firma y la caducidad, sin ninguna
  consulta. Es lo que la app manda en cada petición normal.
- Refresh Token: una cadena aleatoria opaca, vive semanas (REFRESH_TOKEN_DIAS), y SÍ
  se guarda -- pero solo su hash (sha256), nunca el valor real, igual que una
  contraseña. Es lo único que la app guarda de verdad en el móvil (Keystore/Keychain,
  ver expo-secure-store), y con la huella/rostro del usuario (expo-local-authentication
  en la app) puede canjearse por un access token nuevo sin volver a pedir contraseña
  ni TOTP -- la biometría desbloquea el uso del refresh token guardado, nunca
  sustituye al login real la primera vez.
- Rotación: cada vez que se usa un refresh token para pedir un access token nuevo, se
  marca usado y se emite uno nuevo (rotar). Si alguna vez se reutiliza uno ya usado,
  es la señal clásica de que ese token se ha filtrado -- se revocan todos los del
  usuario de golpe."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import IntentoFallido, LoginPendiente, RefreshToken, Usuario
from app.services.panel_agente import notificar_seguridad

_CLAVE_GLOBAL = "__global__"
LOGIN_PENDIENTE_MINUTOS = 5
_JWT_ALGORITMO = "HS256"

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


def _ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------- Access Token (JWT) ----------

def crear_access_token(usuario_id: str) -> str:
    expira = _ahora() + timedelta(minutes=settings.access_token_minutos)
    return jwt.encode({"sub": usuario_id, "exp": expira}, settings.jwt_secret, algorithm=_JWT_ALGORITMO)


def usuario_id_de_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_JWT_ALGORITMO])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


# ---------- Refresh Token (opaco, hash en base de datos) ----------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _crear_refresh_token(db: AsyncSession, usuario_id: str, dispositivo: str | None) -> str:
    crudo = secrets.token_urlsafe(48)
    fila = RefreshToken(
        usuario_id=usuario_id,
        token_hash=_hash_token(crudo),
        dispositivo=dispositivo,
        expira_en=_ahora() + timedelta(days=settings.refresh_token_dias),
    )
    db.add(fila)
    await db.commit()
    return crudo


async def refrescar_token(db: AsyncSession, refresh_token: str, dispositivo: str | None) -> dict:
    """Canjea un refresh token válido por un access token nuevo, y rota el propio
    refresh token (el antiguo queda inservible, se entrega uno nuevo). Si el token
    que llega ya estaba marcado como usado, se interpreta como un robo -- se revocan
    TODOS los refresh tokens de ese usuario, para que un atacante que capturó un
    token viejo no pueda seguir usándolo ni aunque la usuaria real ya haya rotado
    el suyo."""
    resultado = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(refresh_token)))
    fila = resultado.scalar_one_or_none()
    if not fila:
        return {"ok": False, "motivo": "token_invalido"}

    if fila.revocado or (fila.usado_en is not None):
        await db.execute(update(RefreshToken).where(RefreshToken.usuario_id == fila.usuario_id).values(revocado=True))
        await db.commit()
        await notificar_seguridad("posible robo de sesión: se reutilizó un refresh token ya usado, se han cerrado todas las sesiones")
        return {"ok": False, "motivo": "token_reutilizado_revocado_todo"}

    if fila.expira_en < _ahora():
        return {"ok": False, "motivo": "token_caducado"}

    fila.usado_en = _ahora()
    fila.revocado = True
    nuevo_refresh = await _crear_refresh_token(db, fila.usuario_id, dispositivo)
    await db.commit()

    return {
        "ok": True,
        "access_token": crear_access_token(fila.usuario_id),
        "refresh_token": nuevo_refresh,
    }


async def revocar_refresh_token(db: AsyncSession, refresh_token: str) -> None:
    """Logout -- invalida solo este refresh token (este dispositivo), no todos."""
    await db.execute(update(RefreshToken).where(RefreshToken.token_hash == _hash_token(refresh_token)).values(revocado=True))
    await db.commit()


# ---------- bloqueo por fuerza bruta ----------

async def _n_intentos_recientes(db: AsyncSession, clave: str) -> int:
    desde = _ahora() - timedelta(minutes=settings.login_ventana_minutos)
    resultado = await db.execute(
        select(func.count()).select_from(IntentoFallido).where(IntentoFallido.clave == clave, IntentoFallido.creado_en >= desde)
    )
    return resultado.scalar_one()


async def bloqueado(db: AsyncSession, usuario: str) -> bool:
    por_usuario = await _n_intentos_recientes(db, usuario.strip().lower())
    global_ = await _n_intentos_recientes(db, _CLAVE_GLOBAL)
    return por_usuario >= settings.login_max_intentos or global_ >= settings.login_max_intentos * 4


async def registrar_intento_fallido(db: AsyncSession, usuario: str) -> None:
    """Si este intento es el que hace saltar el bloqueo (por usuario o global), se
    avisa por Telegram -- una vez por bloqueo, no en cada intento mientras sigue
    bloqueado (bloqueado() sigue devolviendo True los siguientes N minutos)."""
    ya_bloqueado_antes = await bloqueado(db, usuario)
    db.add(IntentoFallido(clave=usuario.strip().lower()))
    db.add(IntentoFallido(clave=_CLAVE_GLOBAL))
    await db.commit()
    if not ya_bloqueado_antes and await bloqueado(db, usuario):
        await notificar_seguridad(f"acceso bloqueado por varios intentos fallidos ({usuario})")


# ---------- flujo de login ----------

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
    limite = _ahora() - timedelta(minutes=LOGIN_PENDIENTE_MINUTOS)
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

    await db.execute(delete(LoginPendiente).where(LoginPendiente.token_pendiente == token_pendiente))
    await db.commit()

    return {
        "ok": True,
        "access_token": crear_access_token(fila.id),
        "refresh_token": await _crear_refresh_token(db, fila.id, dispositivo),
    }


async def usuario_de_id(db: AsyncSession, usuario_id: str) -> Usuario | None:
    resultado = await db.execute(select(Usuario).where(Usuario.id == usuario_id))
    return resultado.scalar_one_or_none()


async def crear_usuario(db: AsyncSession, usuario: str, password: str) -> Usuario:
    fila = Usuario(usuario=usuario.strip().lower(), password_hash=hash_password(password))
    db.add(fila)
    await db.commit()
    await db.refresh(fila)
    return fila
