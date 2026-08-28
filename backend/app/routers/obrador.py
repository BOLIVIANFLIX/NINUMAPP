from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.estado_conexion import con_estado
from app.services import grocy as grocy_service
from app.services import ha as ha_service
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/obrador", tags=["obrador"])


@router.get("/alarmas")
async def alarmas(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await ha_service.alarmas_neveras()
    return con_estado(conectado, "Home Assistant todavía no está conectado en NINUMAPP.", alarmas=lista)


@router.get("/alarmas-recientes")
async def alarmas_recientes(usuario: Usuario = Depends(usuario_actual)):
    """Historial real de sensores (últimas 5, vistas o no) -- no la lista de
    automatizaciones. Mismo registro permanente que /panel/obrador (Sensores)."""
    lista, conectado = await panel_agente.alarmas_recientes()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", recientes=lista)


@router.get("/alarmas-no-vistas")
async def alarmas_no_vistas(usuario: Usuario = Depends(usuario_actual)):
    """Nº para el badge de Obrador -- alarmas de HA no vistas todavía (ver
    panel_agente.alarmas_no_vistas). Reemplaza a /alarmas (consulta en vivo a HA que
    no coincidía con /alarmas-recientes -- Ariadna, 2026-08-22: "3 avisos que no
    corresponden a nada")."""
    n = await panel_agente.alarmas_no_vistas()
    return {"no_vistas": n or 0}


@router.post("/alarmas-marcar-vistas")
async def alarmas_marcar_vistas(usuario: Usuario = Depends(usuario_actual)):
    """Se llama al entrar en Obrador -- limpia el badge sin tocar el histórico
    ("Alarmas recientes" se queda igual, ver alarmas_recientes arriba). Best-effort:
    si ninuma-agente no responde, no debe romper la pantalla por esto."""
    try:
        await panel_agente.marcar_alarmas_vistas()
    except PanelAgenteError:
        pass
    return {"ok": True}


@router.get("/sensores")
async def sensores(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await ha_service.sensores_obrador()
    alarma, _ = await ha_service.alarmas_activas()
    return con_estado(
        conectado, "Home Assistant todavía no está conectado en NINUMAPP.",
        sensores=lista, alarma_activa=alarma, camaras=ha_service.camaras(),
    )


@router.get("/camaras/{entity_id}/snapshot")
async def snapshot_camara(entity_id: str, usuario: Usuario = Depends(usuario_actual)):
    imagen = await ha_service.snapshot_camara(entity_id)
    if imagen is None:
        raise HTTPException(status_code=404, detail="Cámara no disponible.")
    return Response(content=imagen, media_type="image/jpeg")


@router.get("/recetas")
async def recetas(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await grocy_service.recetas()
    return con_estado(conectado, "Grocy todavía no está conectado en NINUMAPP.", recetas=lista)
