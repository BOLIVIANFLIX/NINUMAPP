import functools

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.services import avisos as avisos_service
from app.services import ha as ha_service
from app.services import panel_agente
from app.services.panel_agente import PanelAgenteError

router = APIRouter(prefix="/api/avisos", tags=["avisos"])


def _manejar_error(f):
    @functools.wraps(f)
    async def envoltura(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except PanelAgenteError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return envoltura


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


class EditarSolicitudBody(BaseModel):
    fecha: str | None = None
    nombre: str | None = None
    telefono: str | None = None
    nif: str | None = None
    es_empresa: bool | None = None
    precio_cents: int | None = None
    tipo_contacto: str | None = None


@router.post("/solicitud/{solicitud_id}/editar")
async def solicitud_editar(solicitud_id: str, body: EditarSolicitudBody, usuario: Usuario = Depends(usuario_actual)):
    ok = await avisos_service.editar_solicitud(
        solicitud_id,
        fecha=body.fecha,
        nombre=body.nombre,
        telefono=body.telefono,
        nif=body.nif,
        es_empresa=body.es_empresa,
        precio_cents=body.precio_cents,
        tipo_contacto=body.tipo_contacto,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="No se ha podido guardar los cambios en la web.")
    return {"ok": True}


@router.get("/pendientes")
async def pendientes(usuario: Usuario = Depends(usuario_actual)):
    """Correo sin resolver + pedidos de la web pendientes de revisar -- mismas dos
    listas que /panel/avisos, con los mismos id/locator que usan asignar-dia y
    confirmar/mover más abajo."""
    datos, conectado = await panel_agente.avisos_pendientes()
    return {
        **datos,
        "conectado": conectado,
        "aviso": None if conectado else "ninuma-agente todavía no está conectado en NINUMAPP.",
    }


class AsignarDiaBody(BaseModel):
    id: int
    fecha: str
    descripcion: str


@router.post("/email/asignar-dia")
@_manejar_error
async def email_asignar_dia(body: AsignarDiaBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.email_asignar_dia(body.id, body.fecha, body.descripcion)


class LocatorBody(BaseModel):
    locator: str


@router.post("/pedido-web/confirmar")
@_manejar_error
async def pedido_web_confirmar(body: LocatorBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.pedido_web_confirmar(body.locator)


class MoverBody(BaseModel):
    locator: str
    fecha: str


@router.post("/pedido-web/mover")
@_manejar_error
async def pedido_web_mover(body: MoverBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.pedido_web_mover(body.locator, body.fecha)
