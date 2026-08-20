"""Lectura de tickets/albaranes con Gemini (capa gratuita de Google AI Studio) --
mismo tipo de servicio externo que ya usa NABU (el bot de Telegram de ninuma-agente)
para lo mismo, pero código propio e independiente aquí, no reutilizado.

`responseMimeType: application/json` fuerza que Gemini devuelva JSON de verdad, sin
tener que parsear bloques ```json de un texto libre."""

import base64
import json

import httpx

from app.config import settings

_MODELO = "gemini-3.6-flash"
_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{_MODELO}:generateContent"


async def leer_imagen(imagen_bytes: bytes, mime_type: str, prompt: str) -> dict | None:
    """Devuelve el JSON que responde Gemini, o None si no está configurado o falla
    (red, clave inválida, respuesta no parseable) -- nunca lanza, para que la pantalla
    de Inventario pueda avisar en vez de romperse."""
    if not settings.gemini_api_key:
        return None

    cuerpo = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(imagen_bytes).decode()}},
                ]
            }
        ],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as cliente:
            resp = await cliente.post(_URL, params={"key": settings.gemini_api_key}, json=cuerpo)
            resp.raise_for_status()
            datos = resp.json()
        texto = datos["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(texto)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None
