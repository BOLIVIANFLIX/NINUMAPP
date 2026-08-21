from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import resumen as resumen_service

router = APIRouter(prefix="/api", tags=["resumen"])


@router.get("/resumen")
async def resumen(usuario: Usuario = Depends(usuario_actual)):
    datos, conectado = await resumen_service.resumen_mes()
    if not conectado or datos is None:
        return {
            "usuario": usuario.usuario,
            "pedidos_confirmados_mes": 0,
            "solicitudes_pendientes": 0,
            "financiero": None,
            "financiero_conectado": False,
            "aviso": "Supabase todavía no está conectado en NINUMAPP.",
        }
    return {
        "usuario": usuario.usuario,
        **datos,
        "aviso": None if datos["financiero_conectado"] else "El resumen financiero todavía no está conectado en NINUMAPP.",
    }
