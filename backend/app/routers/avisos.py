from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.errores import manejar_error as _manejar_error
from app.routers.estado_conexion import con_estado
from app.services import avisos as avisos_service
from app.services import ha as ha_service
from app.services import panel_agente

router = APIRouter(prefix="/api/avisos", tags=["avisos"])


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await avisos_service.solicitudes_pendientes()
    alarma, _ = await ha_service.alarmas_activas()
    return con_estado(conectado, "Supabase todavía no está conectado en NINUMAPP.", solicitudes=lista, alarma_activa=alarma)


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


class DescartarSolicitudBody(BaseModel):
    tipo_contacto: str | None = None


@router.post("/solicitud/{solicitud_id}/descartar")
async def solicitud_descartar(solicitud_id: str, body: DescartarSolicitudBody, usuario: Usuario = Depends(usuario_actual)):
    ok = await avisos_service.descartar_solicitud(solicitud_id, tipo_contacto=body.tipo_contacto)
    if not ok:
        raise HTTPException(status_code=502, detail="No se ha podido guardar los cambios en la web.")
    return {"ok": True}


@router.get("/pendientes")
async def pendientes(usuario: Usuario = Depends(usuario_actual)):
    """Correo sin resolver + pedidos de la web pendientes de revisar -- mismas dos
    listas que /panel/avisos, con los mismos id/locator que usan asignar-dia y
    confirmar/mover más abajo."""
    datos, conectado = await panel_agente.avisos_pendientes()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", **datos)


class AsignarDiaBody(BaseModel):
    id: int
    fecha: str
    descripcion: str


@router.post("/email/asignar-dia")
@_manejar_error
async def email_asignar_dia(body: AsignarDiaBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.email_asignar_dia(body.id, body.fecha, body.descripcion)

# /pedido-web/confirmar y /pedido-web/mover se quitaron el 2026-08-27 -- auditoría de
# bases de datos: solo escribían el "pedido web" en local (SQLite de ninuma-agente) y
# el calendario, nunca en la web de verdad, y la pantalla que los llamaba
# (AsuntoPedidoWeb) no estaba enganchada a ningún sitio real de la app. Confirmar/
# mover la fecha de una solicitud hoy pasa por /solicitud/{id}/editar, que sí
# escribe en la web.
