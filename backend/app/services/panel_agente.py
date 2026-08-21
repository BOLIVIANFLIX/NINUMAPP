"""Lectura de cifras financieras y clientes profesionales desde ninuma-agente
(proyecto aparte, en la Raspberry) -- viven en su SQLite + CSV de contabilidad, no en
Supabase ni en la BD propia de NINUMAPP. Solo lectura vía sus endpoints /api/ninumapp/*
(ver ninuma-agente/api_ninumapp.py), nunca se escribe nada desde aquí."""

from typing import TypedDict

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


async def _get(ruta: str) -> dict | list | None:
    if not settings.panel_agente_url or not settings.ninumapp_api_secret:
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


async def resumen_financiero() -> tuple[ResumenFinanciero | None, bool]:
    datos = await _get("/api/ninumapp/resumen-financiero")
    return (datos, True) if datos is not None else (None, False)


async def clientes_profesionales() -> tuple[list[ClienteProfesional], bool]:
    datos = await _get("/api/ninumapp/clientes-profesionales")
    return (datos, True) if datos is not None else ([], False)


async def documentos_recientes() -> tuple[list[DocumentoReciente], bool]:
    datos = await _get("/api/ninumapp/documentos-recientes")
    return (datos, True) if datos is not None else ([], False)
