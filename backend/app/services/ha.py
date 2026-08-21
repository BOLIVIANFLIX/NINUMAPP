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

# Mismos entity_id que usa ninuma-agente/ha_client.py (sensores_obrador/CAMARAS) --
# aquí sí hace falta una lista fija porque un sensor de temperatura no se puede
# "adivinar" por nombre de forma fiable como las automatizaciones de alarma.
_SENSORES_OBRADOR = [
    ("sensor.temperatura_filtrada_nevera_gris", "Nevera gris"),
    ("sensor.temperatura_filtrada_nevera_rembrandt", "Nevera Rembrandt"),
    ("sensor.temperatura_filtrada_congelador_blanco", "Congelador blanco"),
    ("sensor.temperatura_filtrada_congelador_gris", "Congelador gris"),
    ("sensor.temperatura_filtrada_tester", "Congelador pequeño"),
    ("sensor.consumo_total_casa", "Consumo eléctrico"),
]

_CAMARAS = [
    ("camera.localhost", "Cámara 1"),
    ("camera.camara_yi_2", "Cámara 2"),
    ("camera.camara_yi_3", "Cámara 3"),
]
_ENTITY_IDS_CAMARA_VALIDOS = {entity_id for entity_id, _ in _CAMARAS}


class SensorHA(TypedDict):
    entity_id: str
    etiqueta: str
    valor: str | None
    unidad: str | None


class CamaraHA(TypedDict):
    entity_id: str
    etiqueta: str


async def _estado(cliente: httpx.AsyncClient, entity_id: str) -> dict | None:
    try:
        resp = await cliente.get(
            f"{settings.ha_url.rstrip('/')}/api/states/{entity_id}",
            headers={"Authorization": f"Bearer {settings.ha_token}"},
        )
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError):
        return None


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


async def sensores_obrador() -> tuple[list[SensorHA], bool]:
    """Devuelve (sensores, conectado). Un sensor individual sin datos (HA "unknown"/
    "unavailable", o simplemente no responde) aparece con valor=None -- nunca se
    inventa un número, mejor mostrar "sin datos" en la app."""
    if not settings.ha_url or not settings.ha_token:
        return [], False

    async with httpx.AsyncClient(timeout=5) as cliente:
        sensores: list[SensorHA] = []
        conectado = False
        for entity_id, etiqueta in _SENSORES_OBRADOR:
            estado = await _estado(cliente, entity_id)
            if estado is not None:
                conectado = True
            valor = estado.get("state") if estado else None
            if valor in ("unknown", "unavailable"):
                valor = None
            sensores.append(
                SensorHA(
                    entity_id=entity_id,
                    etiqueta=etiqueta,
                    valor=valor,
                    unidad=estado.get("attributes", {}).get("unit_of_measurement") if estado else None,
                )
            )
    return sensores, conectado


def camaras() -> list[CamaraHA]:
    return [CamaraHA(entity_id=entity_id, etiqueta=etiqueta) for entity_id, etiqueta in _CAMARAS]


async def snapshot_camara(entity_id: str) -> bytes | None:
    """Foto actual de una cámara (JPEG), o None si la entidad no es una cámara
    conocida o HA no responde. Valida contra la lista fija por seguridad -- nunca se
    pasa el entity_id del cliente directamente a la URL sin comprobar antes."""
    if entity_id not in _ENTITY_IDS_CAMARA_VALIDOS:
        return None
    if not settings.ha_url or not settings.ha_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            resp = await cliente.get(
                f"{settings.ha_url.rstrip('/')}/api/camera_proxy/{entity_id}",
                headers={"Authorization": f"Bearer {settings.ha_token}"},
            )
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPError:
        return None


async def alarmas_activas() -> tuple[str | None, bool]:
    """Devuelve (mensaje, conectado). `sensor.alarmas_activas_ahora` ya agrega en HA
    inundación/puerta/consumo en una sola frase legible -- si no hay nada activo,
    el propio sensor devuelve un estado neutro (p.ej. "Sin alarmas") en vez de vacío,
    así que aquí no se decide qué es "alarma" ni "no alarma", solo se muestra tal cual."""
    if not settings.ha_url or not settings.ha_token:
        return None, False
    async with httpx.AsyncClient(timeout=5) as cliente:
        estado = await _estado(cliente, "sensor.alarmas_activas_ahora")
    if estado is None:
        return None, False
    valor = estado.get("state")
    return (valor if valor not in ("unknown", "unavailable") else None), True
