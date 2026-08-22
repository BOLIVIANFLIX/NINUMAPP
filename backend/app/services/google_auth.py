"""Acceso OAuth compartido a la cuenta de Google del negocio -- una única
autorización cubre Gmail (solo lectura) y Calendar (solo lectura), ver
services/gmail.py y services/calendario_google.py. El refresh_token (guardado en
GMAIL_REFRESH_TOKEN por motivos históricos, aunque ya cubre más que Gmail) nunca
puede escribir ni borrar nada en ninguno de los dos servicios."""

import httpx

from app.config import settings

SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly"
REDIRECT_URI = "http://localhost:8000/api/gmail/callback"


def construir_url_autorizacion() -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",  # fuerza a devolver refresh_token incluso si ya se autorizó antes
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{httpx.QueryParams(params)}"


async def intercambiar_codigo_por_refresh_token(codigo: str) -> str:
    """Se llama una única vez, a mano, durante la autorización inicial -- no forma
    parte del funcionamiento normal de la app. Lanza si falla (se está ejecutando a
    mano, un error debe verse, no esconderse)."""
    async with httpx.AsyncClient(timeout=10) as cliente:
        resp = await cliente.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": codigo,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()["refresh_token"]


async def access_token() -> str | None:
    if not (settings.google_client_id and settings.google_client_secret and settings.gmail_refresh_token):
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            resp = await cliente.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "refresh_token": settings.gmail_refresh_token,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "grant_type": "refresh_token",
                },
            )
            resp.raise_for_status()
            return resp.json()["access_token"]
    except httpx.HTTPError:
        return None
