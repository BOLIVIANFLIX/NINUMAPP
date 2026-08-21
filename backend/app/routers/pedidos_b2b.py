"""Vista de solo lectura de los pedidos B2B/profesionales -- datos reales de
ninuma-agente (ver services/panel_agente.py). Deliberadamente sin las acciones de
escritura del panel (generar albarán, cerrar mes y facturar): esta es una réplica de
consulta, no un segundo sitio desde el que facturar de verdad."""

from fastapi import APIRouter, Depends

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import panel_agente

router = APIRouter(prefix="/api/pedidos-b2b", tags=["pedidos-b2b"])


@router.get("/clientes")
async def clientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.clientes_profesionales()
    return {
        "clientes": lista,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }


@router.get("/documentos-recientes")
async def documentos_recientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.documentos_recientes()
    return {
        "documentos": lista,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }
