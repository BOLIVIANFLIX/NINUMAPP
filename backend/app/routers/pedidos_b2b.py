"""Pedidos B2B/profesionales -- datos reales de ninuma-agente (ver
services/panel_agente.py). Incluye generar albarán real, cerrar mes/facturar, y
confirmar pedidos de Grand Folies: todo se ejecuta de verdad en ninuma-agente (mismo
código que usa el panel), NINUMAPP solo hace de interfaz."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.errores import manejar_error as _manejar_error
from app.routers.estado_conexion import con_estado
from app.services import panel_agente

router = APIRouter(prefix="/api/pedidos-b2b", tags=["pedidos-b2b"])


@router.get("/clientes")
async def clientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.clientes_profesionales()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", clientes=lista)


@router.get("/facturas-pendientes-cobro")
async def facturas_pendientes_cobro(usuario: Usuario = Depends(usuario_actual)):
    datos, conectado = await panel_agente.facturas_pendientes_cobro_detalle()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", **datos)


@router.get("/acumulado-mensual-itemizado")
async def acumulado_mensual_itemizado(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.acumulado_mensual_itemizado()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", grupos=lista)


@router.get("/documentos-recientes")
async def documentos_recientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.documentos_recientes()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", documentos=lista)


# ---------------------------------------------------------------------------
# Generar albarán
# ---------------------------------------------------------------------------


@router.get("/albaran/clientes")
@_manejar_error
async def clientes_para_albaran(usuario: Usuario = Depends(usuario_actual)):
    return {"clientes": await panel_agente.clientes_para_albaran()}


class IniciarAlbaranBody(BaseModel):
    cliente: str


@router.post("/albaran/iniciar")
@_manejar_error
async def iniciar_albaran(body: IniciarAlbaranBody, usuario: Usuario = Depends(usuario_actual)):
    sesion = str(uuid.uuid4())
    await panel_agente.iniciar_albaran(sesion, body.cliente)
    return {"sesion": sesion}


@router.get("/albaran/estado")
@_manejar_error
async def estado_albaran(sesion: str, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.estado_albaran(sesion)


class LineaAlbaranBody(BaseModel):
    sesion: str
    descripcion: str
    unidades: float
    codigo: str | None = None
    precio_unitario: float | None = None


@router.post("/albaran/linea")
@_manejar_error
async def anadir_linea(body: LineaAlbaranBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.anadir_linea_albaran(body.sesion, body.descripcion, body.unidades, body.codigo, body.precio_unitario)


class QuitarLineaBody(BaseModel):
    sesion: str
    indice: int


@router.post("/albaran/linea/quitar")
@_manejar_error
async def quitar_linea(body: QuitarLineaBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.quitar_linea_albaran(body.sesion, body.indice)
    return {"ok": True}


class ReferenciaBody(BaseModel):
    sesion: str
    referencia: str


@router.post("/albaran/referencia")
@_manejar_error
async def poner_referencia(body: ReferenciaBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.poner_referencia_albaran(body.sesion, body.referencia)
    return {"ok": True}


class FechaEntregaBody(BaseModel):
    sesion: str
    fecha_entrega: str | None = None


@router.post("/albaran/fecha-entrega")
@_manejar_error
async def poner_fecha_entrega(body: FechaEntregaBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.poner_fecha_entrega_albaran(body.sesion, body.fecha_entrega)
    return {"ok": True}


@router.get("/albaran/previsualizar")
@_manejar_error
async def previsualizar_albaran(sesion: str, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.previsualizar_albaran(sesion)


class FinalizarAlbaranBody(BaseModel):
    sesion: str
    numero_manual: str | None = None
    registrar: bool = True


@router.post("/albaran/finalizar")
@_manejar_error
async def finalizar_albaran(body: FinalizarAlbaranBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.finalizar_albaran(body.sesion, body.numero_manual, body.registrar)


@router.get("/albaran/descargar")
@_manejar_error
async def descargar_albaran(sesion: str, tipo: str, usuario: Usuario = Depends(usuario_actual)):
    resultado = await panel_agente.descargar_albaran(sesion, tipo)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    contenido, content_type = resultado
    return Response(content=contenido, media_type=content_type)


# ---------------------------------------------------------------------------
# Cerrar mes / marcar facturado / marcar cobrado
# ---------------------------------------------------------------------------


class ClienteBody(BaseModel):
    cliente: str


@router.post("/cerrar-mes")
@_manejar_error
async def cerrar_mes(body: ClienteBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cerrar_mes(body.cliente)


class NumeroBody(BaseModel):
    numero: str


@router.post("/marcar-facturado")
@_manejar_error
async def marcar_facturado(body: NumeroBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.marcar_facturado(body.numero)


@router.post("/marcar-entregado")
@_manejar_error
async def marcar_entregado(body: NumeroBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.marcar_entregado(body.numero)


@router.post("/cerrar-cobro-mensual")
@_manejar_error
async def cerrar_cobro_mensual(body: ClienteBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cerrar_cobro_mensual(body.cliente)


@router.post("/marcar-cobrado")
@_manejar_error
async def marcar_cobrado(body: NumeroBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.marcar_cobrado(body.numero)


# ---------------------------------------------------------------------------
# Grand Folies
# ---------------------------------------------------------------------------


@router.get("/grand-folies/pendientes")
async def grand_folies_pendientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.grand_folies_pendientes()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", pedidos=lista)


class LineaGF(BaseModel):
    referencia: str | None = None
    descripcion: str
    cantidad: float
    precio_unitario: float | None = None


class ConfirmarGFBody(BaseModel):
    id: str
    fecha_entrega: str | None = None
    numero_pedido: str | None = None
    numero_manual: str | None = None
    lineas_finales: list[LineaGF]


@router.post("/grand-folies/confirmar")
@_manejar_error
async def grand_folies_confirmar(body: ConfirmarGFBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.grand_folies_confirmar(
        body.id, body.fecha_entrega, body.numero_pedido, body.numero_manual, [l.model_dump() for l in body.lineas_finales]
    )


class DescartarGFBody(BaseModel):
    id: str


@router.post("/grand-folies/descartar")
@_manejar_error
async def grand_folies_descartar(body: DescartarGFBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.grand_folies_descartar(body.id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Pedidos B2B del carrito privado en la web -- mismo patrón que Grand Folies.
# ---------------------------------------------------------------------------


@router.get("/b2b-carrito/pendientes")
async def b2b_carrito_pendientes(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.b2b_carrito_pendientes()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", pedidos=lista)


class LineaB2BCarrito(BaseModel):
    referencia: str | None = None
    descripcion: str
    cantidad: float
    precio_unitario: float | None = None


class ConfirmarB2BCarritoBody(BaseModel):
    id: str
    fecha_entrega: str | None = None
    numero_manual: str | None = None
    lineas_finales: list[LineaB2BCarrito]


@router.post("/b2b-carrito/confirmar")
@_manejar_error
async def b2b_carrito_confirmar(body: ConfirmarB2BCarritoBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.b2b_carrito_confirmar(
        body.id, body.fecha_entrega, body.numero_manual, [l.model_dump() for l in body.lineas_finales]
    )


class DescartarB2BCarritoBody(BaseModel):
    id: str


@router.post("/b2b-carrito/descartar")
@_manejar_error
async def b2b_carrito_descartar(body: DescartarB2BCarritoBody, usuario: Usuario = Depends(usuario_actual)):
    await panel_agente.b2b_carrito_descartar(body.id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Documentos históricos + ficha de cliente -- réplica de /panel/pedidos/documentos,
# /panel/pedidos/documento(+archivo), /panel/clientes/{nombre}.
# ---------------------------------------------------------------------------


@router.get("/documentos")
async def documentos(usuario: Usuario = Depends(usuario_actual)):
    lista, conectado = await panel_agente.todos_los_documentos()
    return con_estado(conectado, "ninuma-agente todavía no está conectado en NINUMAPP.", documentos=lista)


@router.get("/documento")
@_manejar_error
async def documento(numero: str, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.documento_detalle(numero)


@router.get("/documento/archivo")
@_manejar_error
async def documento_archivo(numero: str, tipo: str = "pdf", usuario: Usuario = Depends(usuario_actual)):
    resultado = await panel_agente.documento_archivo(numero, tipo)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    contenido, content_type = resultado
    return Response(content=contenido, media_type=content_type)


@router.get("/clientes/detalle")
@_manejar_error
async def cliente_detalle(nombre: str, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cliente_detalle(nombre)


class CrearClienteBody(BaseModel):
    nombre: str
    direccion: str = ""
    cif: str = ""
    tipo_facturacion: str = "directa"


@router.post("/clientes/crear")
@_manejar_error
async def crear_cliente(body: CrearClienteBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cliente_crear(body.nombre, body.direccion, body.cif, body.tipo_facturacion)


class EditarClienteBody(BaseModel):
    nombre: str
    direccion: str = ""
    cif: str = ""
    nombre_documento: str | None = None
    tipo_facturacion: str = "directa"


@router.post("/clientes/editar")
@_manejar_error
async def editar_cliente(body: EditarClienteBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.cliente_editar(body.nombre, body.direccion, body.cif, body.nombre_documento, body.tipo_facturacion)


# ---------------------------------------------------------------------------
# Catálogo de precios por cliente -- precio propio por producto y por profesional.
# ---------------------------------------------------------------------------


@router.get("/catalogo")
@_manejar_error
async def catalogo(cliente: str, usuario: Usuario = Depends(usuario_actual)):
    return {"productos": await panel_agente.catalogo_cliente(cliente)}


class CatalogoCrearBody(BaseModel):
    cliente: str
    descripcion: str
    precio: float
    codigo: str | None = None


@router.post("/catalogo/crear")
@_manejar_error
async def catalogo_crear(body: CatalogoCrearBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.catalogo_crear(body.cliente, body.descripcion, body.precio, body.codigo)


class CatalogoEditarBody(BaseModel):
    id: int
    descripcion: str
    precio: float
    codigo: str | None = None


@router.post("/catalogo/editar")
@_manejar_error
async def catalogo_editar(body: CatalogoEditarBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.catalogo_editar(body.id, body.descripcion, body.precio, body.codigo)


class CatalogoIdBody(BaseModel):
    id: int


@router.post("/catalogo/eliminar")
@_manejar_error
async def catalogo_eliminar(body: CatalogoIdBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.catalogo_eliminar(body.id)
