"""Datos de la pantalla Inicio -- de momento con estructura real pero datos de
ejemplo, hasta que se conecten las integraciones (Supabase/Gmail/Grocy) en un paso
posterior del proyecto. El objetivo de hoy es demostrar login real + pantalla
protegida real, no la integración completa (eso es trabajo de varias semanas, ver la
conversación del 2026-08-20)."""

from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual

router = APIRouter(prefix="/api", tags=["resumen"])


@router.get("/resumen")
async def resumen(usuario: Usuario = Depends(usuario_actual)):
    return {
        "usuario": usuario.usuario,
        "ingresos_sin_iva_mes": 0.0,
        "facturas_pendientes_cobro": 0,
        "contactos_sin_resolver": 0,
        "aviso": "Datos de ejemplo -- las integraciones reales (Supabase, Gmail, Grocy) todavía no están conectadas en NINUMAPP.",
    }
