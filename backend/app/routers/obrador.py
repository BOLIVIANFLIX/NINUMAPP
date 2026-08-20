from fastapi import APIRouter, Depends

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


@router.get("/recetas")
async def recetas(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await grocy_service.recetas()
    return {
        "recetas": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Grocy todavía no está conectado en NINUMAPP.",
    }
