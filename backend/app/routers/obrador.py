from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import grocy as grocy_service
from app.services import ha as ha_service

router = APIRouter(prefix="/api/obrador", tags=["obrador"])


@router.get("/alarmas")
async def alarmas(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await ha_service.alarmas_neveras()
    return {
        "alarmas": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Home Assistant todavía no está conectado en NINUMAPP.",
    }


@router.get("/sensores")
async def sensores(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await ha_service.sensores_obrador()
    alarma, _ = await ha_service.alarmas_activas()
    return {
        "sensores": lista,
        "alarma_activa": alarma,
        "camaras": ha_service.camaras(),
        "conectado": conectado,
        "aviso": None if conectado else "Home Assistant todavía no está conectado en NINUMAPP.",
    }


@router.get("/camaras/{entity_id}/snapshot")
async def snapshot_camara(entity_id: str, usuario: Usuario = Depends(usuario_actual)):
    imagen = await ha_service.snapshot_camara(entity_id)
    if imagen is None:
        raise HTTPException(status_code=404, detail="Cámara no disponible.")
    return Response(content=imagen, media_type="image/jpeg")


@router.get("/recetas")
async def recetas(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await grocy_service.recetas()
    return {
        "recetas": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Grocy todavía no está conectado en NINUMAPP.",
    }
