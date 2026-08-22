from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import calendario_google

router = APIRouter(prefix="/api/calendario", tags=["calendario"])


@router.get("/eventos")
async def eventos(desde: str, hasta: str, usuario: Usuario = Depends(usuario_actual)):
    """`desde`/`hasta` en formato ISO (YYYY-MM-DD) -- normalmente el primer y último
    día del mes que se está mostrando en la app."""
    desde_dt = datetime.fromisoformat(desde).replace(tzinfo=timezone.utc)
    hasta_dt = datetime.fromisoformat(hasta).replace(tzinfo=timezone.utc)
    lista, conectado = await calendario_google.eventos(desde_dt, hasta_dt)
    return {
        "eventos": lista,
        "conectado": conectado,
        "aviso": None if conectado else "Calendario todavía no está conectado en NINUMAPP.",
    }
