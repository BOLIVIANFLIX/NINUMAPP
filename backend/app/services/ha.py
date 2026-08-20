"""Lectura de alarmas desde Home Assistant (vive en la Raspberry, fuera de este
proyecto) -- solo lectura vía su API REST estándar, nunca bloquea el resto de la app
si no responde.

En vez de depender de una lista fija de entity_id (que solo existe en el HA real de
Ariadna y cambiaría si añade/renombra automatizaciones), se descubren por patrón:
cualquier automatización cuyo nombre sugiera una alarma de frío -- "alarma",
"congelador", "nevera", "puerta", "temperatura". Si hace falta afinar la lista más
adelante, se ajustan las palabras clave aquí, sin tocar nada más."""

from datetime import datetime
from typing import TypedDict

import httpx

from app.config import settings

_PALABRAS_CLAVE = ("alarma", "congelador", "nevera", "puerta", "temperatura")


class AlarmaHA(TypedDict):
    entity_id: str
    nombre: str
    ultima_vez: datetime | None


async def alarmas_neveras() -> tuple[list[AlarmaHA], bool]:
    """Devuelve (alarmas, conectado)."""
    if not settings.ha_url or not settings.ha_token:
        return [], False

    try:
        async with httpx.AsyncClient(timeout=5) as cliente:
            resp = await cliente.get(
                f"{settings.ha_url.rstrip('/')}/api/states",
                headers={"Authorization": f"Bearer {settings.ha_token}"},
            )
            resp.raise_for_status()
            estados = resp.json()
    except (httpx.HTTPError, ValueError):
        return [], False

    alarmas: list[AlarmaHA] = []
    for estado in estados:
        entity_id = estado.get("entity_id", "")
        if not entity_id.startswith("automation."):
            continue
        nombre = estado.get("attributes", {}).get("friendly_name", entity_id)
        if not any(palabra in nombre.lower() or palabra in entity_id.lower() for palabra in _PALABRAS_CLAVE):
            continue
        ultima_vez_raw = estado.get("attributes", {}).get("last_triggered")
        alarmas.append(
            AlarmaHA(
                entity_id=entity_id,
                nombre=nombre,
                ultima_vez=datetime.fromisoformat(ultima_vez_raw) if ultima_vez_raw else None,
            )
        )

    return alarmas, True
