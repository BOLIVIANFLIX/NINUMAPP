from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import pedidos as pedidos_service

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await pedidos_service.pedidos_confirmados()
    return {
        "pedidos": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Supabase todavía no está conectado en NINUMAPP.",
    }
