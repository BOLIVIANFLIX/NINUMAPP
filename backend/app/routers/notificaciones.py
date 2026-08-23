"""Notificaciones push (Expo) -- pedido explícito de Ariadna 2026-08-23 para poder ir
dejando los avisos de Telegram por push. Tres caminos:

- /registrar-token: la propia app, logueada, guarda el token del dispositivo aquí
  cada vez que arranca (ver app/routers/auth.py para el login).
- /enviar: server-a-servidor, para que ninuma-agente o la web (WBD) puedan pedir un
  aviso -- mismo secreto compartido que ya usan entre sí (NINUMAPP_API_SECRET), ahora
  también válido en este sentido. `tipo` es opcional por compatibilidad hacia atrás,
  pero todo llamador nuevo debe mandarlo -- sin él, el aviso nunca se puede apagar
  desde /preferencias.
- /preferencias: la app, logueada, lee y marca/desmarca qué tipos de aviso quiere
  recibir -- pedido explícito de Ariadna 2026-08-23 ("quiero un menú donde marcar o
  desmarcar los avisos que quiero que me lleguen"), en vez de decidirlo nosotros de
  antemano uno por uno."""

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import DispositivoPush, PreferenciaNotificacion, Usuario
from app.routers.auth import usuario_actual

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])

_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Catálogo completo de tipos de aviso -- clave usada por /enviar y por /preferencias,
# con la etiqueta legible que pinta la app y si nace activado o no. Los tres primeros
# ya estaban migrados y en marcha antes de tener este catálogo (nacen activados para
# no cambiarle el comportamiento a nadie sin que ella lo pida); el resto son avisos
# que hoy solo manda el bot de Telegram, y nacen apagados hasta que Ariadna decida
# activarlos uno a uno desde la app.
_DEFAULTS: dict[str, tuple[str, bool]] = {
    "email_nuevo": ("Encargo o correo nuevo detectado", True),
    "contacto_web": ("Contacto nuevo por la web", True),
    "pedido_pagado": ("Pedido pagado (Stripe)", True),
    "resumen_diario": ("Resumen diario", False),
    "resumen_fiscal_semanal": ("Resumen fiscal semanal", False),
    "backup_diario": ("Backup diario", False),
    "resumen_papel_semanal": ("Resumen de papel semanal", False),
    "subida_precios": ("Subida de precios de ingredientes", False),
    "alarma_ha": ("Alarma de Home Assistant", False),
}


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
    tipo: str | None = None


def _verificar_secreto(x_notificaciones_secret: str | None) -> None:
    if not settings.ninumapp_api_secret or x_notificaciones_secret != settings.ninumapp_api_secret:
        raise HTTPException(status_code=401, detail="Secreto inválido.")


async def _tipo_activo(db: AsyncSession, tipo: str) -> bool:
    fila = (await db.execute(select(PreferenciaNotificacion).where(PreferenciaNotificacion.tipo == tipo))).scalar_one_or_none()
    if fila is not None:
        return fila.activo
    return _DEFAULTS.get(tipo, ("", True))[1]


@router.post("/enviar")
async def enviar(
    body: EnviarBody,
    db: AsyncSession = Depends(get_db),
    x_notificaciones_secret: str | None = Header(default=None),
):
    _verificar_secreto(x_notificaciones_secret)

    if body.tipo and not await _tipo_activo(db, body.tipo):
        return {"ok": True, "enviados": 0, "omitido_por_preferencia": True}

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


@router.get("/preferencias")
async def preferencias(usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    guardadas = {f.tipo: f.activo for f in (await db.execute(select(PreferenciaNotificacion))).scalars().all()}
    return [
        {"tipo": tipo, "etiqueta": etiqueta, "activo": guardadas.get(tipo, default_activo)}
        for tipo, (etiqueta, default_activo) in _DEFAULTS.items()
    ]


class PreferenciaBody(BaseModel):
    tipo: str
    activo: bool


@router.post("/preferencias")
async def guardar_preferencia(body: PreferenciaBody, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    if body.tipo not in _DEFAULTS:
        raise HTTPException(status_code=400, detail="Tipo de aviso desconocido.")
    fila = (await db.execute(select(PreferenciaNotificacion).where(PreferenciaNotificacion.tipo == body.tipo))).scalar_one_or_none()
    if fila:
        fila.activo = body.activo
    else:
        db.add(PreferenciaNotificacion(tipo=body.tipo, activo=body.activo))
    await db.commit()
    return {"ok": True}
