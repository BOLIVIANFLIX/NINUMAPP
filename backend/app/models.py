"""Modelos propios de NINUMAPP -- base de datos independiente de ninuma-agente/la
Raspberry (Grocy y Home Assistant se consultan por red, ver services/, pero esta base
de datos no vive ahí ni depende de que esos servicios estén disponibles)."""

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _ahora() -> datetime:
    # Naive UTC a propósito (no timezone.utc con tzinfo) -- SQLite no conserva la
    # información de zona horaria al leer de vuelta (aiosqlite la devuelve naive),
    # así que comparar contra un datetime aware revienta en desarrollo aunque
    # funcione en Postgres. Trabajando siempre en naive UTC, igual en los dos sitios.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    usuario: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    totp_secret: Mapped[str | None] = mapped_column(String, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=_ahora)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")


class RefreshToken(Base):
    """Modelo Access Token (JWT, vive minutos, nunca se guarda en base de datos) +
    Refresh Token (opaco, vive semanas, SÍ se guarda -- pero solo su hash, nunca el
    valor real, igual que una contraseña) -- ver app/auth.py.

    Rotación: cada vez que se usa un refresh token para pedir un access token nuevo,
    ESE refresh token se marca usado y se emite uno nuevo (rotate_de). Si alguna vez
    se reutiliza uno ya usado, es la señal clásica de un token robado -- se revocan
    todos los de ese usuario (ver auth.refrescar_token)."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    usuario_id: Mapped[str] = mapped_column(String, ForeignKey("usuarios.id"))
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True)
    dispositivo: Mapped[str | None] = mapped_column(String, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=_ahora)
    expira_en: Mapped[datetime] = mapped_column(DateTime)
    usado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revocado: Mapped[bool] = mapped_column(Boolean, default=False)

    usuario: Mapped["Usuario"] = relationship(back_populates="refresh_tokens")


class LoginPendiente(Base):
    """Estado intermedio entre "contraseña correcta" y "sesión real" -- igual que
    ninuma-agente, el segundo factor (TOTP) es obligatorio y no se crea una sesión de
    verdad hasta verificarlo. token_pendiente vive pocos minutos (ver
    LOGIN_PENDIENTE_MINUTOS en el router)."""

    __tablename__ = "logins_pendientes"

    token_pendiente: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: secrets.token_urlsafe(24))
    usuario_id: Mapped[str] = mapped_column(String, ForeignKey("usuarios.id"))
    configurando_totp: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=_ahora)


class IntentoFallido(Base):
    """Un registro por intento fallido -- se cuenta cuántos hay en la ventana de
    LOGIN_VENTANA_MINUTOS para bloquear, igual que ninuma-agente. `clave` es el
    usuario (en minúsculas) o "__global__" para el límite general anti fuerza-bruta
    contra usuarios distintos."""

    __tablename__ = "intentos_fallidos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clave: Mapped[str] = mapped_column(String, index=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=_ahora)
