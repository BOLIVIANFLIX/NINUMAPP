"""Escaneo de tickets de compra y albaranes propios con la cámara -- todo dentro de
NINUMAPP (cámara → Gemini lee la imagen → se empareja contra el catálogo de Grocy →
Ariadna confirma → se escribe en Grocy). Nada de esto llama a bots externos ni a
Telegram; es la misma idea que ya usa NABU en ninuma-agente, pero construida de cero
aquí, código propio e independiente.

Dos flujos separados a propósito (en vez de que la IA adivine cuál es cuál, más
fiable): "ticket de compra" empareja contra productos/ingredientes y SUMA stock;
"mi propio albarán" empareja contra recetas y CONSUME sus ingredientes."""

import difflib
import unicodedata
from typing import TypedDict

from app.services import gemini, grocy

_PROMPT_TICKET = """Eres un asistente que lee tickets de compra de un obrador de
pastelería. Extrae cada línea de producto comprado, con su cantidad y precio unitario
si aparece (no el total de la línea, el precio por unidad). Devuelve SOLO un JSON con
este formato exacto, sin explicaciones:
{"lineas": [{"producto": "string", "cantidad": number, "precio_unitario": number_o_null}]}
No incluyas el total, subtotal ni el IVA como si fueran una línea de producto."""

_PROMPT_ALBARAN = """Eres un asistente que lee albaranes de entrega de un obrador de
pastelería (lo que se ha entregado a un cliente). Extrae cada línea con el nombre del
producto/receta entregado y la cantidad de unidades. Devuelve SOLO un JSON con este
formato exacto, sin explicaciones:
{"lineas": [{"producto": "string", "cantidad": number}]}"""

_UMBRAL_CONFIANZA = 0.6


def _normalizar(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sin_acentos.lower().strip()


def _emparejar(nombre_leido: str, catalogo: list[tuple[int, str]]) -> tuple[int | None, str | None, float]:
    """Devuelve (id, nombre, confianza 0-1) del mejor candidato del catálogo, o
    (None, None, 0) si no hay ninguno por encima del umbral -- mejor marcarlo como
    "no encontrado, revisar a mano" que emparejar mal y tocar el producto/receta
    equivocada."""
    objetivo = _normalizar(nombre_leido)
    mejor: tuple[int, str, float] | None = None
    for id_, nombre in catalogo:
        ratio = difflib.SequenceMatcher(None, objetivo, _normalizar(nombre)).ratio()
        if mejor is None or ratio > mejor[2]:
            mejor = (id_, nombre, ratio)
    if mejor is None or mejor[2] < _UMBRAL_CONFIANZA:
        return None, None, 0.0
    return mejor


class LineaTicket(TypedDict):
    producto_leido: str
    cantidad: float
    precio_unitario: float | None
    producto_id: int | None
    producto_nombre: str | None
    confianza: float


class LineaAlbaran(TypedDict):
    producto_leido: str
    cantidad: float
    receta_id: int | None
    receta_nombre: str | None
    confianza: float


async def procesar_ticket(imagen_bytes: bytes, mime_type: str) -> tuple[list[LineaTicket], bool]:
    """Devuelve (líneas, ok). ok=False si Gemini o Grocy no están configurados, o si
    la imagen no se pudo leer -- para que la pantalla avise en vez de mostrar una
    lista vacía como si no hubiera nada que comprar."""
    catalogo, conectado_grocy = await grocy.productos()
    if not conectado_grocy:
        return [], False

    resultado = await gemini.leer_imagen(imagen_bytes, mime_type, _PROMPT_TICKET)
    if resultado is None:
        return [], False

    pares = [(p["id"], p["nombre"]) for p in catalogo]
    lineas: list[LineaTicket] = []
    for linea in resultado.get("lineas", []):
        producto_id, producto_nombre, confianza = _emparejar(linea["producto"], pares)
        lineas.append(
            LineaTicket(
                producto_leido=linea["producto"],
                cantidad=float(linea["cantidad"]),
                precio_unitario=linea.get("precio_unitario"),
                producto_id=producto_id,
                producto_nombre=producto_nombre,
                confianza=confianza,
            )
        )
    return lineas, True


async def procesar_albaran(imagen_bytes: bytes, mime_type: str) -> tuple[list[LineaAlbaran], bool]:
    """Devuelve (líneas, ok) -- mismo criterio que procesar_ticket, pero contra el
    catálogo de recetas en vez de productos."""
    catalogo, conectado_grocy = await grocy.recetas()
    if not conectado_grocy:
        return [], False

    resultado = await gemini.leer_imagen(imagen_bytes, mime_type, _PROMPT_ALBARAN)
    if resultado is None:
        return [], False

    pares = [(r["id"], r["nombre"]) for r in catalogo]
    lineas: list[LineaAlbaran] = []
    for linea in resultado.get("lineas", []):
        receta_id, receta_nombre, confianza = _emparejar(linea["producto"], pares)
        lineas.append(
            LineaAlbaran(
                producto_leido=linea["producto"],
                cantidad=float(linea["cantidad"]),
                receta_id=receta_id,
                receta_nombre=receta_nombre,
                confianza=confianza,
            )
        )
    return lineas, True


async def confirmar_ticket(lineas: list[dict]) -> None:
    """Suma a stock cada línea confirmada -- lineas ya vienen solo con las que
    Ariadna aceptó en la pantalla de confirmación (nunca las de confianza baja sin
    revisar a mano)."""
    for linea in lineas:
        await grocy.anadir_stock(linea["producto_id"], linea["cantidad"], linea.get("precio_unitario"))


async def confirmar_albaran(lineas: list[dict]) -> None:
    """Consume de stock los ingredientes de cada receta confirmada."""
    for linea in lineas:
        await grocy.consumir_receta(linea["receta_id"], linea["cantidad"])
