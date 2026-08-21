"""Lectura de Gmail (correo del negocio) -- solo lectura, scope
`gmail.readonly`, nunca puede enviar ni borrar nada.

No hay login por usuario dentro de NINUMAPP para esto: es UNA cuenta de correo (la de
Ariadna) autorizada una única vez a mano (ver `flujo_autorizacion.md` más abajo), no
un flujo OAuth por cada persona que entra a la app. El refresh_token que sale de esa
autorización única se guarda en `.env` (GMAIL_REFRESH_TOKEN) como cualquier otro
secreto de este proyecto.

Flujo de autorización (una sola vez, a mano):
1. GET /api/gmail/auth-url (con sesión iniciada en NINUMAPP) -- devuelve la URL de
   consentimiento de Google.
2. Ariadna abre esa URL en su navegador, inicia sesión con la cuenta del negocio,
   acepta el permiso de solo lectura de Gmail.
3. Google intenta redirigir a http://localhost:8000/api/gmail/callback?code=... --
   si el backend no está corriendo en esa misma máquina en ese momento, el
   navegador mostrará "no se puede acceder a este sitio", NO PASA NADA: el código
   sigue estando en la URL de la barra de direcciones, cópialo de ahí.
4. Ese código se intercambia una vez por un refresh_token (ver
   intercambiar_codigo_por_refresh_token, se ejecuta a mano/una vez, no desde la
   app) -- el refresh_token resultante se guarda en `.env` y ya no hace falta
   repetir nada de esto salvo que se revoque el acceso."""

import html
from typing import TypedDict

import httpx

from app.config import settings

_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
_REDIRECT_URI = "http://localhost:8000/api/gmail/callback"


def construir_url_autorizacion() -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPE,
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
                "redirect_uri": _REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()["refresh_token"]


async def _access_token() -> str | None:
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


class CorreoPendiente(TypedDict):
    id: str
    de: str
    asunto: str
    resumen: str
    fecha: str


async def correos_pendientes(limite: int = 20) -> tuple[list[CorreoPendiente], bool]:
    """Devuelve (correos, conectado) -- correos sin leer de la bandeja de entrada
    (categoría principal, no promociones/social -- ver la query `category:primary`)."""
    token = await _access_token()
    if token is None:
        return [], False

    cabeceras = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            lista = await cliente.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers=cabeceras,
                params={"q": "in:inbox is:unread category:primary", "maxResults": limite},
            )
            lista.raise_for_status()
            ids = [m["id"] for m in lista.json().get("messages", [])]

            correos: list[CorreoPendiente] = []
            for id_ in ids:
                detalle = await cliente.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{id_}",
                    headers=cabeceras,
                    params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
                )
                detalle.raise_for_status()
                datos = detalle.json()
                cabeceras_msg = {h["name"]: h["value"] for h in datos.get("payload", {}).get("headers", [])}
                correos.append(
                    CorreoPendiente(
                        id=id_,
                        de=cabeceras_msg.get("From", "?"),
                        asunto=cabeceras_msg.get("Subject", "(sin asunto)"),
                        resumen=html.unescape(datos.get("snippet", "")),
                        fecha=cabeceras_msg.get("Date", ""),
                    )
                )
    except httpx.HTTPError:
        return [], False

    return correos, True
