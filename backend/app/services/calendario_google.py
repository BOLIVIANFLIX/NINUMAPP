"""Lectura del calendario de NINUMÁ vía la API de Google Calendar (solo lectura,
scope `calendar.readonly`, ver services/google_auth.py -- mismo permiso que Gmail,
una única autorización). Deliberadamente NO se usa un iframe/WebView embed: eso
exigiría que el calendario fuera público o que la app pidiera login de Google cada
vez -- leyendo los eventos por API, la app los dibuja ella misma y el calendario
sigue siendo privado de verdad."""

from datetime import datetime
from typing import TypedDict

import httpx

from app.config import settings
from app.services import google_auth


class EventoCalendario(TypedDict):
    id: str
    titulo: str
    inicio: str  # ISO -- puede ser fecha (todo el día) u hora exacta
    fin: str
    todo_el_dia: bool
    color: str | None


async def eventos(desde: datetime, hasta: datetime) -> tuple[list[EventoCalendario], bool]:
    """Devuelve (eventos, conectado)."""
    if not settings.google_calendar_id:
        return [], False
    token = await google_auth.access_token()
    if token is None:
        return [], False

    try:
        async with httpx.AsyncClient(timeout=10) as cliente:
            resp = await cliente.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{settings.google_calendar_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "timeMin": desde.isoformat(),
                    "timeMax": hasta.isoformat(),
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 250,
                },
            )
            resp.raise_for_status()
            datos = resp.json()
    except httpx.HTTPError:
        return [], False

    eventos_lista: list[EventoCalendario] = []
    for item in datos.get("items", []):
        inicio_raw = item.get("start", {})
        fin_raw = item.get("end", {})
        todo_el_dia = "date" in inicio_raw
        eventos_lista.append(
            EventoCalendario(
                id=item["id"],
                titulo=item.get("summary", "(sin título)"),
                inicio=inicio_raw.get("date") or inicio_raw.get("dateTime", ""),
                fin=fin_raw.get("date") or fin_raw.get("dateTime", ""),
                todo_el_dia=todo_el_dia,
                color=item.get("colorId"),
            )
        )
    return eventos_lista, True
