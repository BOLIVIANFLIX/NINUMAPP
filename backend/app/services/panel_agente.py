"""Cifras financieras/B2B, generación de albaranes reales y confirmación de pedidos de
Grand Folies -- todo vive en ninuma-agente (proyecto aparte, en la Raspberry), vía sus
endpoints /api/ninumapp/* (ver ninuma-agente/api_ninumapp.py). NINUMAPP nunca reimplementa
esa lógica de facturación: solo llama a las mismas funciones que ya usa el panel, así el
comportamiento (numeración, descuento de stock, contabilidad, documento) es idéntico."""

import urllib.parse
from typing import Any, TypedDict

import httpx

from app.config import settings


class FacturasPendientes(TypedDict):
    total_eur: float
    documentos: int


class AcumuladoMensual(TypedDict):
    total_eur: float
    albaranes: int
    clientes: list[str]


class AcumuladoDirecta(TypedDict):
    total_eur: float
    listas_para_emitir: int


class ProximaEntrega(TypedDict):
    cliente: str
    fecha: str
    descripcion: str | None
    mas_ese_dia: int


class ResumenFinanciero(TypedDict):
    ingresos_sin_iva_cobrados_mes: float
    facturas_pendientes_cobro: FacturasPendientes
    acumulado_sin_facturar: dict  # {"mensual": AcumuladoMensual, "directa": AcumuladoDirecta}
    gastos_mes: float
    contactos_sin_resolver: int
    proxima_entrega: ProximaEntrega | None
    hay_aviso_analisis: bool


class ClienteProfesional(TypedDict):
    nombre: str
    tipo_facturacion: str
    albaranes_abiertos: int


class DocumentoReciente(TypedDict):
    numero: str
    cliente: str
    estado: str
    creado_en: str


class PanelAgenteError(Exception):
    pass


def _configurada() -> bool:
    return bool(settings.panel_agente_url and settings.ninumapp_api_secret)


async def _get(ruta: str) -> dict | list | None:
    if not _configurada():
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as cliente:
            resp = await cliente.get(
                f"{settings.panel_agente_url.rstrip('/')}{ruta}",
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret},
            )
            resp.raise_for_status()
            return resp.json()
    except (httpx.HTTPError, ValueError):
        return None


async def _get_q(ruta: str, params: dict[str, Any]) -> dict | list | None:
    limpio = {k: v for k, v in params.items() if v is not None}
    return await _get(f"{ruta}?{urllib.parse.urlencode(limpio)}")


async def _post(ruta: str, cuerpo: dict[str, Any]) -> dict | None:
    """A diferencia de _get, no traga errores en silencio devolviendo None -- quien
    escribe (generar un albarán, cerrar un mes) necesita saber si falló de verdad,
    no solo que "no hay datos". Se relanza como PanelAgenteError con el detalle que
    ninuma-agente haya devuelto, para que el router lo convierta en un 4xx/5xx claro."""
    if not _configurada():
        raise PanelAgenteError("ninuma-agente todavía no está conectado en NINUMAPP.")
    try:
        async with httpx.AsyncClient(timeout=20) as cliente:
            resp = await cliente.post(
                f"{settings.panel_agente_url.rstrip('/')}{ruta}",
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret},
                json=cuerpo,
            )
            datos = resp.json()
            if resp.status_code >= 400:
                raise PanelAgenteError(datos.get("detail", "Error en ninuma-agente."))
            return datos
    except httpx.HTTPError as e:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.") from e


async def notificar_seguridad(mensaje: str) -> None:
    """Aviso por Telegram (mismo bot que ya usa Ariadna a diario) para eventos de
    seguridad reales del login de NINUMAPP -- bloqueo por fuerza bruta, robo de
    sesión detectado. Best-effort a propósito: si ninuma-agente no responde, el
    login/refresh no debe fallar por esto -- el error se traga aquí mismo."""
    try:
        await _post("/api/ninumapp/notificar-seguridad", {"mensaje": mensaje})
    except PanelAgenteError:
        pass


async def resumen_financiero() -> tuple[ResumenFinanciero | None, bool]:
    datos = await _get("/api/ninumapp/resumen-financiero")
    return (datos, True) if datos is not None else (None, False)


async def acumulado_mensual_itemizado() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/acumulado-mensual-itemizado")
    return (datos, True) if datos is not None else ([], False)


async def clientes_profesionales() -> tuple[list[ClienteProfesional], bool]:
    datos = await _get("/api/ninumapp/clientes-profesionales")
    return (datos, True) if datos is not None else ([], False)


async def facturas_pendientes_cobro_detalle() -> tuple[dict, bool]:
    datos = await _get("/api/ninumapp/facturas-pendientes-cobro")
    return (datos, True) if datos is not None else ({"mensuales": [], "directas": []}, False)


async def documentos_recientes() -> tuple[list[DocumentoReciente], bool]:
    datos = await _get("/api/ninumapp/documentos-recientes")
    return (datos, True) if datos is not None else ([], False)


# ---------------------------------------------------------------------------
# Generar albarán -- asistente en varios pasos, "sesion" la genera y mantiene quien
# llama (un UUID por alta en curso). Nada de esto escribe de verdad hasta
# finalizar_albaran (numeración/stock/contabilidad reales).
# ---------------------------------------------------------------------------


async def clientes_para_albaran() -> list[dict]:
    datos = await _get("/api/ninumapp/clientes-para-albaran")
    return datos or []


async def iniciar_albaran(sesion: str, cliente: str) -> None:
    await _post("/api/ninumapp/albaran/iniciar", {"sesion": sesion, "cliente": cliente})


async def estado_albaran(sesion: str) -> dict:
    datos = await _get(f"/api/ninumapp/albaran/estado?sesion={sesion}")
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def anadir_linea_albaran(
    sesion: str, descripcion: str, unidades: float, codigo: str | None = None, precio_unitario: float | None = None
) -> dict:
    return await _post(
        "/api/ninumapp/albaran/linea",
        {"sesion": sesion, "descripcion": descripcion, "unidades": unidades, "codigo": codigo, "precio_unitario": precio_unitario},
    )


async def quitar_linea_albaran(sesion: str, indice: int) -> None:
    await _post("/api/ninumapp/albaran/linea/quitar", {"sesion": sesion, "indice": indice})


async def poner_referencia_albaran(sesion: str, referencia: str) -> None:
    await _post("/api/ninumapp/albaran/referencia", {"sesion": sesion, "referencia": referencia})


async def poner_fecha_entrega_albaran(sesion: str, fecha_entrega: str | None) -> None:
    await _post("/api/ninumapp/albaran/fecha-entrega", {"sesion": sesion, "fecha_entrega": fecha_entrega})


async def previsualizar_albaran(sesion: str) -> dict:
    datos = await _get(f"/api/ninumapp/albaran/previsualizar?sesion={sesion}")
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def finalizar_albaran(sesion: str, numero_manual: str | None, registrar: bool) -> dict:
    """Punto de no retorno: consume la numeración siempre, y si registrar=True,
    también descuenta stock real en Grocy y escribe en la contabilidad."""
    return await _post("/api/ninumapp/albaran/finalizar", {"sesion": sesion, "numero_manual": numero_manual, "registrar": registrar})


async def descargar_albaran(sesion: str, tipo: str) -> tuple[bytes, str] | None:
    if not _configurada():
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as cliente:
            resp = await cliente.get(
                f"{settings.panel_agente_url.rstrip('/')}/api/ninumapp/albaran/descargar",
                params={"sesion": sesion, "tipo": tipo},
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret},
            )
            if resp.status_code != 200:
                return None
            return resp.content, resp.headers.get("content-type", "application/octet-stream")
    except httpx.HTTPError:
        return None


# ---------------------------------------------------------------------------
# Cerrar mes / marcar facturado / marcar cobrado
# ---------------------------------------------------------------------------


async def cerrar_mes(cliente: str) -> dict:
    return await _post("/api/ninumapp/pedidos/cerrar-mes", {"cliente": cliente})


async def marcar_facturado(numero: str) -> dict:
    return await _post("/api/ninumapp/pedidos/marcar-facturado", {"numero": numero})


async def cerrar_cobro_mensual(cliente: str) -> dict:
    return await _post("/api/ninumapp/pedidos/cerrar-cobro-mensual", {"cliente": cliente})


async def marcar_cobrado(numero: str) -> dict:
    return await _post("/api/ninumapp/pedidos/marcar-cobrado", {"numero": numero})


# ---------------------------------------------------------------------------
# Grand Folies -- los borradores ya se crean solos (poll de Gmail en ninuma-agente),
# aquí solo se listan/confirman/descartan.
# ---------------------------------------------------------------------------


async def grand_folies_pendientes() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/grand-folies/pendientes")
    return (datos, True) if datos is not None else ([], False)


async def grand_folies_confirmar(
    id_: str, fecha_entrega: str | None, numero_pedido: str | None, numero_manual: str | None, lineas_finales: list[dict]
) -> dict:
    return await _post(
        "/api/ninumapp/grand-folies/confirmar",
        {"id": id_, "fecha_entrega": fecha_entrega, "numero_pedido": numero_pedido, "numero_manual": numero_manual, "lineas_finales": lineas_finales},
    )


async def grand_folies_descartar(id_: str) -> None:
    await _post("/api/ninumapp/grand-folies/descartar", {"id": id_})


# ---------------------------------------------------------------------------
# Gestión de usuarios del panel (ninuma-agente) -- distinto del login propio de
# NINUMAPP (ver app/auth.py): esto administra las cuentas que entran a
# ninuma-bot.tunga.es/panel, no las de NINUMAPP.
# ---------------------------------------------------------------------------


async def usuarios_panel() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/usuarios")
    return (datos, True) if datos is not None else ([], False)


async def crear_usuario_panel(usuario: str, password: str) -> dict:
    return await _post("/api/ninumapp/usuarios/crear", {"usuario": usuario, "password": password})


async def eliminar_usuario_panel(usuario: str) -> dict:
    return await _post("/api/ninumapp/usuarios/eliminar", {"usuario": usuario})


async def cerrar_sesion_usuario_panel(usuario: str) -> None:
    await _post("/api/ninumapp/usuarios/cerrar-sesion", {"usuario": usuario})


async def cambiar_password_usuario_panel(usuario: str, password: str) -> dict:
    return await _post("/api/ninumapp/usuarios/cambiar-password", {"usuario": usuario, "password": password})


# ---------------------------------------------------------------------------
# Obrador -- alarmas recientes (historial real de sensores, no automatizaciones)
# ---------------------------------------------------------------------------


async def alarmas_recientes() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/alarmas-recientes")
    return (datos, True) if datos is not None else ([], False)


async def alarmas_no_vistas() -> int | None:
    """Nº para el badge de Obrador -- mismo criterio "visto" que /panel/obrador,
    hasta ahora nunca conectado a NINUMAPP (usaba en su lugar una consulta en vivo a
    Home Assistant que no coincidía con "Alarmas recientes" -- ver alarmas_recientes
    arriba, fix 2026-08-22)."""
    datos = await _get("/api/ninumapp/alarmas-no-vistas")
    return datos.get("no_vistas") if datos is not None else None


async def marcar_alarmas_vistas() -> None:
    await _post("/api/ninumapp/alarmas-marcar-vistas", {})


# ---------------------------------------------------------------------------
# Inventario -- un solo botón de escaneo, la IA decide sola ticket_compra vs.
# albaran_propio (ver inventario.escanear en ninuma-agente). Nunca reimplementado
# aquí: si se hiciera aparte, lo escaneado no llegaría a la contabilidad real.
# ---------------------------------------------------------------------------


async def inventario_escanear(imagen: bytes, content_type: str) -> dict:
    if not _configurada():
        raise PanelAgenteError("ninuma-agente todavía no está conectado en NINUMAPP.")
    try:
        async with httpx.AsyncClient(timeout=45) as cliente:
            resp = await cliente.post(
                f"{settings.panel_agente_url.rstrip('/')}/api/ninumapp/inventario/escanear",
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret, "Content-Type": content_type},
                content=imagen,
            )
            datos = resp.json()
            if resp.status_code >= 400:
                raise PanelAgenteError(datos.get("detail", "No se ha podido leer la foto."))
            return datos
    except httpx.HTTPError as e:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.") from e


async def inventario_confirmar(
    escaneo_id: str, categoria: str | None = None, base_imponible: float | None = None,
    iva_importe: float | None = None, iva_porcentaje: float | None = None,
) -> dict:
    cuerpo: dict = {"id": escaneo_id}
    if categoria is not None:
        cuerpo["categoria"] = categoria
    if base_imponible is not None:
        cuerpo["base_imponible"] = base_imponible
    if iva_importe is not None:
        cuerpo["iva_importe"] = iva_importe
    if iva_porcentaje is not None:
        cuerpo["iva_porcentaje"] = iva_porcentaje
    return await _post("/api/ninumapp/inventario/confirmar", cuerpo)


async def inventario_descartar(escaneo_id: str) -> None:
    await _post("/api/ninumapp/inventario/descartar", {"id": escaneo_id})


async def inventario_stock_actual() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/inventario/stock-actual")
    return (datos, True) if datos is not None else ([], False)


async def inventario_movimientos_recientes() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/inventario/movimientos-recientes")
    return (datos, True) if datos is not None else ([], False)


async def iva_trimestre(anio: int, trimestre: int) -> dict | None:
    return await _get_q("/api/ninumapp/iva-trimestre", {"anio": anio, "trimestre": trimestre})


async def modelo_130(anio: int, trimestre: int) -> dict | None:
    return await _get_q("/api/ninumapp/modelo-130", {"anio": anio, "trimestre": trimestre})


async def trimestres_recientes(anio: int, trimestre: int) -> list[dict] | None:
    return await _get_q("/api/ninumapp/trimestres-recientes", {"anio": anio, "trimestre": trimestre})


async def inventario_tickets_periodo(desde: str, hasta: str) -> tuple[bytes, str] | None:
    if not _configurada():
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as cliente:
            resp = await cliente.get(
                f"{settings.panel_agente_url.rstrip('/')}/api/ninumapp/inventario/tickets-periodo",
                params={"desde": desde, "hasta": hasta},
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret},
            )
            if resp.status_code != 200:
                return None
            return resp.content, resp.headers.get("content-type", "application/zip")
    except httpx.HTTPError:
        return None


# ---------------------------------------------------------------------------
# Avisos -- correo sin resolver + pedidos de la web pendientes de revisar
# ---------------------------------------------------------------------------


async def avisos_pendientes() -> tuple[dict, bool]:
    datos = await _get("/api/ninumapp/avisos-pendientes")
    return (datos, True) if datos is not None else ({"encargos": [], "pedidos_web": []}, False)


# ---------------------------------------------------------------------------
# Análisis financiero
# ---------------------------------------------------------------------------


async def analisis_resumen(p: str, desde: str | None = None, hasta: str | None = None) -> dict:
    datos = await _get_q("/api/ninumapp/analisis/resumen", {"p": p, "desde": desde, "hasta": hasta})
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def analisis_productos(p: str, desde: str | None = None, hasta: str | None = None) -> list[dict]:
    datos = await _get_q("/api/ninumapp/analisis/productos", {"p": p, "desde": desde, "hasta": hasta})
    return datos or []


async def analisis_recetas() -> dict:
    datos = await _get("/api/ninumapp/analisis/recetas")
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def analisis_precios() -> list[dict]:
    datos = await _get("/api/ninumapp/analisis/precios")
    return datos or []


async def guardar_config_costes(precio_hora: float, horas_mes: float) -> dict:
    return await _post("/api/ninumapp/analisis/costes/guardar-config", {"precio_hora": precio_hora, "horas_mes": horas_mes})


async def guardar_tiempo_receta(recipe_id: int, minutos: int, precio_hora: float) -> dict:
    return await _post(
        "/api/ninumapp/analisis/costes/guardar-tiempo",
        {"recipe_id": recipe_id, "minutos": minutos, "precio_hora": precio_hora},
    )


# ---------------------------------------------------------------------------
# Ingresos y gastos
# ---------------------------------------------------------------------------


async def ingresos_del_mes(mes: str | None = None) -> dict:
    datos = await _get_q("/api/ninumapp/ingresos", {"mes": mes})
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def crear_gasto(
    categoria: str, importe: float, fecha: str, descripcion: str | None = None, lugar_compra: str | None = None,
    producto: str | None = None, recurrente: bool = False, pagado: bool = True,
) -> dict:
    return await _post(
        "/api/ninumapp/ingresos/gastos/crear",
        {
            "categoria": categoria, "importe": importe, "fecha": fecha, "descripcion": descripcion,
            "lugar_compra": lugar_compra, "producto": producto, "recurrente": recurrente, "pagado": pagado,
        },
    )


async def eliminar_gasto(id_: int) -> dict:
    return await _post("/api/ninumapp/ingresos/gastos/eliminar", {"id": id_})


async def marcar_gasto_pagado(id_: int) -> dict:
    return await _post("/api/ninumapp/ingresos/gastos/marcar-pagado", {"id": id_})


# ---------------------------------------------------------------------------
# Documentos históricos + ficha de cliente
# ---------------------------------------------------------------------------


async def todos_los_documentos() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/documentos")
    return (datos, True) if datos is not None else ([], False)


async def documento_detalle(numero: str) -> dict:
    datos = await _get_q("/api/ninumapp/documento", {"numero": numero})
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def documento_archivo(numero: str, tipo: str) -> tuple[bytes, str] | None:
    if not _configurada():
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as cliente:
            resp = await cliente.get(
                f"{settings.panel_agente_url.rstrip('/')}/api/ninumapp/documento/archivo",
                params={"numero": numero, "tipo": tipo},
                headers={"X-Ninumapp-Secret": settings.ninumapp_api_secret},
            )
            if resp.status_code != 200:
                return None
            return resp.content, resp.headers.get("content-type", "application/octet-stream")
    except httpx.HTTPError:
        return None


async def cliente_detalle(nombre: str) -> dict:
    datos = await _get_q("/api/ninumapp/cliente", {"nombre": nombre})
    if datos is None:
        raise PanelAgenteError("No se ha podido conectar con ninuma-agente.")
    return datos


async def cliente_crear(nombre: str, direccion: str, cif: str, tipo_facturacion: str) -> dict:
    return await _post(
        "/api/ninumapp/cliente/crear",
        {"nombre": nombre, "direccion": direccion, "cif": cif, "tipo_facturacion": tipo_facturacion},
    )


async def cliente_editar(nombre: str, direccion: str, cif: str, nombre_documento: str | None, tipo_facturacion: str) -> dict:
    return await _post(
        "/api/ninumapp/cliente/editar",
        {"nombre": nombre, "direccion": direccion, "cif": cif, "nombre_documento": nombre_documento, "tipo_facturacion": tipo_facturacion},
    )


# ---------------------------------------------------------------------------
# Catálogo de precios por cliente -- cada profesional tiene sus propios productos
# con un precio propio (puede repetirse el mismo producto en otro cliente con un
# precio distinto). Es el precio de referencia que se ofrece primero en el
# asistente de albarán (ver albaran.clientes_para_app/anadir_linea_app).
# ---------------------------------------------------------------------------


async def catalogo_cliente(cliente: str) -> list[dict]:
    datos = await _get_q("/api/ninumapp/catalogo-cliente", {"cliente": cliente})
    return datos or []


async def catalogo_crear(cliente: str, descripcion: str, precio: float, codigo: str | None = None) -> dict:
    return await _post("/api/ninumapp/catalogo-cliente/crear", {"cliente": cliente, "descripcion": descripcion, "precio": precio, "codigo": codigo})


async def catalogo_editar(id_: int, descripcion: str, precio: float, codigo: str | None = None) -> dict:
    return await _post("/api/ninumapp/catalogo-cliente/editar", {"id": id_, "descripcion": descripcion, "precio": precio, "codigo": codigo})


async def catalogo_eliminar(id_: int) -> dict:
    return await _post("/api/ninumapp/catalogo-cliente/eliminar", {"id": id_})


# ---------------------------------------------------------------------------
# Precio público de la tienda online -- override editable sin tocar el contenido
# markdown de la web (ver WBD/src/lib/preciosOverride.ts).
# ---------------------------------------------------------------------------


async def precios_tienda_online() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/precios-tienda-online")
    if datos is None:
        return [], False
    return datos["precios"], datos["conectado"]


async def precio_tienda_guardar(referencia: str, precio: float | None = None, activo: bool | None = None) -> dict:
    cuerpo: dict[str, Any] = {"referencia": referencia}
    if precio is not None:
        cuerpo["precio"] = precio
    if activo is not None:
        cuerpo["activo"] = activo
    return await _post("/api/ninumapp/precios-tienda-online/guardar", cuerpo)


async def precio_tienda_eliminar(referencia: str) -> dict:
    return await _post("/api/ninumapp/precios-tienda-online/eliminar", {"referencia": referencia})


async def catalogo_tienda() -> tuple[list[dict], bool]:
    datos = await _get("/api/ninumapp/catalogo-tienda")
    if datos is None:
        return [], False
    return datos["piezas"], datos["conectado"]


# ---------------------------------------------------------------------------
# Avisos -- convertir correo en pedido, confirmar/mover pedido web
# ---------------------------------------------------------------------------


async def gmail_ids_resueltos(gmail_ids: list[str]) -> list[str]:
    """Subconjunto de `gmail_ids` que ninuma-agente ya clasificó y resolvió del todo
    (sin ningún rastro pendiente en la app) -- para no mostrarlos en "Correos sin
    leer" sin ninguna acción posible. Falla en silencio a lista vacía (nada se
    filtra) si ninuma-agente no responde, igual que el resto de esta integración."""
    try:
        datos = await _post("/api/ninumapp/gmail/ids-resueltos", {"gmail_ids": gmail_ids})
    except PanelAgenteError:
        return []
    return datos.get("resueltos", []) if datos else []


async def email_asignar_dia(id_: int, fecha: str, descripcion: str) -> dict:
    return await _post("/api/ninumapp/avisos/email/asignar-dia", {"id": id_, "fecha": fecha, "descripcion": descripcion})


async def pedido_web_confirmar(locator: str) -> dict:
    return await _post("/api/ninumapp/avisos/pedido-web/confirmar", {"locator": locator})


async def pedido_web_mover(locator: str, fecha: str) -> dict:
    return await _post("/api/ninumapp/avisos/pedido-web/mover", {"locator": locator, "fecha": fecha})
