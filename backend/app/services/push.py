"""Núcleo del envío de push (Expo) -- vive aparte de app/routers/notificaciones.py
para poder llamarse en proceso desde app/auth.py (alertas de seguridad del propio
login: bloqueo por fuerza bruta, robo de sesión) sin depender de que ninuma-agente
esté levantado ni pasar por HTTP. Ariadna, 2026-08-29: "quiero un sistema que si hay
una alerta de seguridad me envíe un aviso a la app" sin depender del bot de Telegram
para esto. Poner esto en app/routers/notificaciones.py habría creado un import
circular (ese router ya importa app/routers/auth.py, que importa app/auth.py)."""

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AvisoHistorial, DispositivoPush, PreferenciaNotificacion

_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def _tipo_activo(db: AsyncSession, tipo: str, default_activo: bool) -> bool:
    fila = (await db.execute(select(PreferenciaNotificacion).where(PreferenciaNotificacion.tipo == tipo))).scalar_one_or_none()
    return fila.activo if fila is not None else default_activo


async def enviar_interno(
    db: AsyncSession, titulo: str, cuerpo: str, datos: dict | None = None, tipo: str | None = None, default_activo: bool = True
) -> dict:
    # Queda constancia siempre, aunque el tipo esté desactivado o no haya ningún
    # dispositivo con push registrado -- el push es un canal más, no el único sitio
    # donde debe verse que esto ha pasado (ver AvisoHistorial en app/models.py).
    db.add(AvisoHistorial(tipo=tipo or "otro", titulo=titulo, cuerpo=cuerpo))
    await db.commit()

    if tipo and not await _tipo_activo(db, tipo, default_activo):
        return {"ok": True, "enviados": 0, "omitido_por_preferencia": True}

    tokens = [d.expo_push_token for d in (await db.execute(select(DispositivoPush))).scalars().all()]
    if not tokens:
        return {"ok": True, "enviados": 0}

    mensajes = [{"to": t, "title": titulo, "body": cuerpo, "data": datos or {}} for t in tokens]
    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            await cliente.post(_EXPO_PUSH_URL, json=mensajes, headers={"Content-Type": "application/json"})
    except httpx.HTTPError:
        # No debe romper al llamador -- el push es un canal más, no el único sitio
        # donde queda constancia (ver AvisoHistorial arriba).
        return {"ok": False, "enviados": 0}

    return {"ok": True, "enviados": len(tokens)}
