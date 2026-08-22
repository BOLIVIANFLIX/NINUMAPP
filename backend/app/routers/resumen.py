from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import resumen as resumen_service

router = APIRouter(prefix="/api", tags=["resumen"])


@router.get("/resumen")
async def resumen(usuario: Usuario = Depends(usuario_actual)):
    datos, conectado_supabase = await resumen_service.resumen_mes()
    avisos = []
    if not conectado_supabase:
        avisos.append("Supabase todavía no está conectado en NINUMAPP.")
    if not datos["financiero_conectado"]:
        avisos.append("El resumen financiero todavía no está conectado en NINUMAPP.")
    return {
        "usuario": usuario.usuario,
        **datos,
        "aviso": " · ".join(avisos) or None,
    }
