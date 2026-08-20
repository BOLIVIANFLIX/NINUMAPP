"""Lectura y escritura en Grocy (vive en la Raspberry, fuera de este proyecto).

Las lecturas nunca bloquean el resto de la app si Grocy no responde (devuelven
listas vacías / False). Las escrituras (añadir stock, consumir receta) SÍ pueden
lanzar -- las llama Inventario únicamente tras confirmación explícita de Ariadna,
nunca en automático, así que un fallo debe verse, no esconderse en silencio.

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


class Producto(TypedDict):
    id: int
    nombre: str


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


async def productos() -> tuple[list[Producto], bool]:
    """Devuelve (productos, conectado) -- catálogo de ingredientes/materia prima,
    para emparejar contra las líneas leídas de un ticket de compra."""
    if not _configurado():
        return [], False

    try:
        async with httpx.AsyncClient(timeout=5) as cliente:
            resp = await cliente.get(_url("/api/objects/products"), headers=_cabeceras())
            resp.raise_for_status()
            objetos = resp.json()
    except (httpx.HTTPError, ValueError):
        return [], False

    return [Producto(id=int(o["id"]), nombre=o["name"]) for o in objetos if o.get("active")], True


async def anadir_stock(producto_id: int, cantidad: float, precio_unitario: float | None) -> None:
    """Suma `cantidad` al stock de `producto_id`. Lanza httpx.HTTPError si falla --
    se llama solo tras confirmación explícita en Inventario, un fallo debe
    propagarse y verse, no perderse en silencio."""
    cuerpo: dict[str, object] = {"amount": cantidad}
    if precio_unitario is not None:
        cuerpo["price"] = precio_unitario
    async with httpx.AsyncClient(timeout=10) as cliente:
        resp = await cliente.post(_url(f"/api/stock/products/{producto_id}/add"), headers=_cabeceras(), json=cuerpo)
        resp.raise_for_status()


async def consumir_receta(receta_id: int, raciones: float) -> None:
    """Descuenta del stock los ingredientes de `receta_id` para `raciones`
    unidades. Lanza httpx.HTTPError si falla -- mismo motivo que anadir_stock.

    Grocy no acepta las raciones como parámetro del propio consumo -- primero hay
    que fijar `desired_servings` en la receta (igual que hace su interfaz web: se
    ajustan las raciones deseadas y luego se pulsa "Consumir"), y solo entonces
    /consume descuenta la cantidad de ingredientes que corresponda a esas raciones."""
    async with httpx.AsyncClient(timeout=10) as cliente:
        resp = await cliente.put(
            _url(f"/api/objects/recipes/{receta_id}"),
            headers=_cabeceras(),
            json={"desired_servings": raciones},
        )
        resp.raise_for_status()
        resp = await cliente.post(_url(f"/api/recipes/{receta_id}/consume"), headers=_cabeceras())
        resp.raise_for_status()
