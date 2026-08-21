"""Cifras financieras/B2B, generación de albaranes reales y confirmación de pedidos de
Grand Folies -- todo vive en ninuma-agente (proyecto aparte, en la Raspberry), vía sus
endpoints /api/ninumapp/* (ver ninuma-agente/api_ninumapp.py). NINUMAPP nunca reimplementa
esa lógica de facturación: solo llama a las mismas funciones que ya usa el panel, así el
comportamiento (numeración, descuento de stock, contabilidad, documento) es idéntico."""

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


class ResumenFinanciero(TypedDict):
    ingresos_sin_iva_cobrados_mes: float
    facturas_pendientes_cobro: FacturasPendientes
    acumulado_sin_facturar: dict  # {"mensual": AcumuladoMensual, "directa": AcumuladoDirecta}
    gastos_mes: float


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


async def resumen_financiero() -> tuple[ResumenFinanciero | None, bool]:
    datos = await _get("/api/ninumapp/resumen-financiero")
    return (datos, True) if datos is not None else (None, False)


async def clientes_profesionales() -> tuple[list[ClienteProfesional], bool]:
    datos = await _get("/api/ninumapp/clientes-profesionales")
    return (datos, True) if datos is not None else ([], False)


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
