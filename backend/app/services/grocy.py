"""Lectura de recetas desde Grocy (vive en la Raspberry, fuera de este proyecto) --
solo lectura, nunca bloquea el resto de la app si no responde.

El coste real por hora (mano de obra + ingredientes) es un cálculo de negocio propio
que no vive en Grocy -- se deja fuera de este primer corte a propósito en vez de
adivinar la fórmula; se añade cuando se defina de nuevo para NINUMAPP."""

from typing import TypedDict

import httpx

from app.config import settings


class Receta(TypedDict):
    id: int
    nombre: str
    descripcion: str | None


async def recetas() -> tuple[list[Receta], bool]:
    """Devuelve (recetas, conectado)."""
    if not settings.grocy_url or not settings.grocy_api_key:
        return [], False

    try:
        async with httpx.AsyncClient(timeout=5) as cliente:
            resp = await cliente.get(
                f"{settings.grocy_url.rstrip('/')}/api/objects/recipes",
                headers={"GROCY-API-KEY": settings.grocy_api_key},
            )
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
