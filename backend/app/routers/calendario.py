from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.estado_conexion import con_estado
from app.services import calendario_google

router = APIRouter(prefix="/api/calendario", tags=["calendario"])

# NINUMÁ opera solo en Mallorca -- los eventos de Google Calendar (todos creados con
# fecha "de todo el día", ver WBD/src/lib/google-calendar.ts) se entienden siempre en
# esta zona horaria, nunca en UTC. Usar UTC aquí desplazaba/excluía eventos cerca de
# medianoche o del borde del mes (bug real: Ariadna, 2026-08-25).
_ZONA_NINUMA = ZoneInfo("Europe/Madrid")


@router.get("/eventos")
async def eventos(desde: str, hasta: str, usuario: Usuario = Depends(usuario_actual)):
    """`desde`/`hasta` en formato ISO (YYYY-MM-DD) -- normalmente el primer y último
    día del mes que se está mostrando en la app."""
    desde_dt = datetime.combine(date.fromisoformat(desde), datetime.min.time(), tzinfo=_ZONA_NINUMA)
    # timeMax es exclusivo -- se usa la medianoche del día SIGUIENTE a `hasta` para
    # cubrir ese último día entero, no solo hasta su medianoche de entrada.
    hasta_dt = datetime.combine(date.fromisoformat(hasta) + timedelta(days=1), datetime.min.time(), tzinfo=_ZONA_NINUMA)
    lista, conectado = await calendario_google.eventos(desde_dt, hasta_dt)
    return con_estado(conectado, "Calendario todavía no está conectado en NINUMAPP.", eventos=lista)
