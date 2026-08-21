from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import avisos as avisos_service
from app.services import ha as ha_service

router = APIRouter(prefix="/api/avisos", tags=["avisos"])


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await avisos_service.solicitudes_pendientes()
    alarma, _ = await ha_service.alarmas_activas()
    return {
        "solicitudes": lista,
        "alarma_activa": alarma,
        "conectado": conectado,
        "aviso": None if conectado else "Supabase todavía no está conectado en NINUMAPP.",
    }
