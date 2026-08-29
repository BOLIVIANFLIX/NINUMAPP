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

import hmac
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AvisoHistorial, DispositivoPush, PreferenciaNotificacion, Usuario
from app.routers.auth import usuario_actual
from app.services.push import enviar_interno as _enviar_interno_nucleo

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])

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
    "boletin_suscripcion": ("Nueva suscripción al boletín", True),
    "error_sistema": ("Error en una tarea automática (conexión, etc.)", True),
    "seguridad": ("Alertas de seguridad del login (bloqueos, robo de sesión)", True),
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
    if not settings.ninumapp_api_secret or not x_notificaciones_secret:
        raise HTTPException(status_code=401, detail="Secreto inválido.")
    # compare_digest en vez de != -- comparación en tiempo constante, evita filtrar
    # por timing cuánto del secreto coincide. Comparando bytes (.encode()), no str
    # -- Ariadna, 2026-08-27, tras un code-review externo del PR: compare_digest
    # rechaza con TypeError un str con algún carácter no-ASCII (verificado), y los
    # headers HTTP se decodifican como latin-1, así que un byte >= 0x80 en esta
    # cabecera tumbaba la ruta con un 500 en vez de devolver 401. Con bytes no
    # existe ese caso especial -- cualquier valor compara sin lanzar.
    if not hmac.compare_digest(x_notificaciones_secret.encode(), settings.ninumapp_api_secret.encode()):
        raise HTTPException(status_code=401, detail="Secreto inválido.")


@router.post("/enviar")
async def enviar(
    body: EnviarBody,
    db: AsyncSession = Depends(get_db),
    x_notificaciones_secret: str | None = Header(default=None),
):
    _verificar_secreto(x_notificaciones_secret)
    default_activo = _DEFAULTS.get(body.tipo, ("", True))[1] if body.tipo else True
    return await _enviar_interno_nucleo(db, body.titulo, body.cuerpo, body.datos, body.tipo, default_activo)


class AvisoHistorialOut(BaseModel):
    id: str
    tipo: str
    titulo: str
    cuerpo: str
    leido: bool
    creado_en: datetime

    model_config = {"from_attributes": True}


@router.get("/historial", response_model=list[AvisoHistorialOut])
async def historial(
    limite: int = Query(default=50, ge=0, le=200),
    usuario: Usuario = Depends(usuario_actual),
    db: AsyncSession = Depends(get_db),
):
    filas = (
        await db.execute(select(AvisoHistorial).order_by(desc(AvisoHistorial.creado_en)).limit(limite))
    ).scalars().all()
    return filas


@router.get("/historial/no-leidos")
async def historial_no_leidos(usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    total = (
        await db.execute(select(func.count()).select_from(AvisoHistorial).where(AvisoHistorial.leido.is_(False)))
    ).scalar_one()
    return {"no_leidos": total}


@router.post("/historial/{aviso_id}/leido")
async def marcar_leido(aviso_id: str, usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    fila = (await db.execute(select(AvisoHistorial).where(AvisoHistorial.id == aviso_id))).scalar_one_or_none()
    if not fila:
        raise HTTPException(status_code=404, detail="Aviso no encontrado.")
    fila.leido = True
    await db.commit()
    return {"ok": True}


@router.post("/historial/marcar-todos-leidos")
async def marcar_todos_leidos(usuario: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    await db.execute(update(AvisoHistorial).where(AvisoHistorial.leido.is_(False)).values(leido=True))
    await db.commit()
    return {"ok": True}


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
