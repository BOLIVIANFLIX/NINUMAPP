"""Lectura de recetas de Grocy (vive en la Raspberry, fuera de este proyecto) --
nunca bloquea el resto de la app si Grocy no responde (devuelve lista vacía /
False). El descuento real de stock al confirmar un albarán o inventario pasa
siempre por ninuma-agente (ver services/panel_agente.py), nunca desde aquí."""

from typing import TypedDict

import httpx

from app.config import settings


class Receta(TypedDict):
    id: int
    nombre: str
    descripcion: str | None


def _configurado() -> bool:
    return bool(settings.grocy_url and settings.grocy_api_key)


def _cabeceras() -> dict[str, str]:
    return {"GROCY-API-KEY": settings.grocy_api_key}


def _url(ruta: str) -> str:
    return f"{settings.grocy_url.rstrip('/')}{ruta}"


async def recetas() -> tuple[list[Receta], bool]:
    """Devuelve (recetas, conectado)."""
    if not _configurado():
        return [], False

    try:
        async with httpx.AsyncClient(timeout=5) as cliente:
            resp = await cliente.get(_url("/api/objects/recipes"), headers=_cabeceras())
            resp.raise_for_status()
            objetos = resp.json()
    except (httpx.HTTPError, ValueError):
        return [], False

    # type='normal' son recetas de verdad -- Grocy también devuelve aquí sus propias
    # entradas internas de planificador semanal (type='mealplan-week'/'mealplan-day'),
    # que no son recetas y no deben aparecer en la lista.
    return [
        Receta(id=int(o["id"]), nombre=o["name"], descripcion=o.get("description"))
        for o in objetos
        if o.get("type") == "normal"
    ], True

