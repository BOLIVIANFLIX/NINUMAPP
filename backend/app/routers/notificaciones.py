"""Notificaciones push (Expo) -- pedido explícito de Ariadna 2026-08-23 para poder ir
dejando los avisos de Telegram (contacto nuevo por email/web, de momento -- el resto
se decide uno por uno). Dos caminos:

- /registrar-token: la propia app, logueada, guarda el token del dispositivo aquí
  cada vez que arranca (ver app/routers/auth.py para el login).
- /enviar: server-a-servidor, para que ninuma-agente o la web (WBD) puedan pedir un
  aviso -- mismo secreto compartido que ya usan entre sí (NINUMAPP_API_SECRET), ahora
  también válido en este sentido."""

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import DispositivoPush, Usuario
from app.routers.auth import usuario_actual

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])

_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class RegistrarTokenBody(BaseModel):
    token: str
    plataforma: str | None = None


@router.post("/registrar-token")
async def registrar_token(
    body: RegistrarTokenBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)
):
    existente = (await db.execute(select(DispositivoPush).where(DispositivoPush.expo_push_token == body.token))).scalar_one_or_none()
    if existente:
        existente.usuario_id = usuario.id
        existente.plataforma = body.plataforma
    else:
        db.add(DispositivoPush(usuario_id=usuario.id, expo_push_token=body.token, plataforma=body.plataforma))
    await db.commit()
    return {"ok": True}


class EnviarBody(BaseModel):
    titulo: str
    cuerpo: str
    datos: dict | None = None


def _verificar_secreto(x_notificaciones_secret: str | None) -> None:
    if not settings.ninumapp_api_secret or x_notificaciones_secret != settings.ninumapp_api_secret:
        raise HTTPException(status_code=401, detail="Secreto inválido.")


@router.post("/enviar")
async def enviar(
    body: EnviarBody,
    db: AsyncSession = Depends(get_db),
    x_notificaciones_secret: str | None = Header(default=None),
):
    _verificar_secreto(x_notificaciones_secret)

    tokens = [d.expo_push_token for d in (await db.execute(select(DispositivoPush))).scalars().all()]
    if not tokens:
        return {"ok": True, "enviados": 0}

    mensajes = [{"to": t, "title": body.titulo, "body": body.cuerpo, "data": body.datos or {}} for t in tokens]
    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            await cliente.post(_EXPO_PUSH_URL, json=mensajes, headers={"Content-Type": "application/json"})
    except httpx.HTTPError:
        # No debe romper al llamador (ninuma-agente/WBD) -- el aviso original por
        # Telegram, si lo hay, ya se mandó; esto es un canal adicional, no el único.
        return {"ok": False, "enviados": 0}

    return {"ok": True, "enviados": len(tokens)}
