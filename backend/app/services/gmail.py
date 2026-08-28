"""Lectura de Gmail (correo del negocio) -- solo lectura, scope
`gmail.readonly`, nunca puede enviar ni borrar nada.

No hay login por usuario dentro de NINUMAPP para esto: es UNA cuenta de correo (la de
Ariadna) autorizada una única vez a mano (ver flujo de autorización en
services/google_auth.py -- el mismo permiso cubre también Calendar, ver
services/calendario_google.py). El refresh_token que sale de esa autorización única
se guarda en `.env` (GMAIL_REFRESH_TOKEN) como cualquier otro secreto de este
proyecto.

Flujo de autorización (una sola vez, a mano):
1. GET /api/gmail/auth-url (con sesión iniciada en NINUMAPP) -- devuelve la URL de
   consentimiento de Google.
2. Ariadna abre esa URL en su navegador, inicia sesión con la cuenta del negocio,
   acepta los permisos de solo lectura de Gmail y Calendar.
3. Google intenta redirigir a http://localhost:8000/api/gmail/callback?code=... --
   si el backend no está corriendo en esa misma máquina en ese momento, el
   navegador mostrará "no se puede acceder a este sitio", NO PASA NADA: el código
   sigue estando en la URL de la barra de direcciones, cópialo de ahí.
4. Ese código se intercambia una vez por un refresh_token (ver
   google_auth.intercambiar_codigo_por_refresh_token, se ejecuta a mano/una vez, no
   desde la app) -- el refresh_token resultante se guarda en `.env` y ya no hace
   falta repetir nada de esto salvo que se revoque el acceso."""

import asyncio
import base64
import html
from typing import TypedDict

import httpx

from app.services import google_auth
from app.services import panel_agente


class CorreoPendiente(TypedDict):
    id: str
    de: str
    asunto: str
    resumen: str
    fecha: str


# Mismo texto que TIPO_LABEL en WBD/src/pages/api/contacto-confirmacion.ts -- el
# cuerpo de un aviso de Formspree del formulario de contacto (ver
# _parsear_formulario_contacto) trae el campo "tipo" tal cual, sin traducir.
_TIPO_LABEL = {
    "encargo": "Encargo",
    "b2b": "Colaboración B2B",
    "edicion": "Consulta sobre edición especial",
    "informacion": "Consulta general",
}

_CAMPOS_FORMULARIO_CONTACTO = {"nombre", "email", "telefono", "tipo", "fecha", "personas", "descripcion", "origen", "rgpd"}


def _parsear_formulario_contacto(cuerpo: str) -> dict[str, str] | None:
    """El cuerpo en texto plano de un aviso de Formspree del formulario de contacto
    (ver ContactoForm.astro) trae cada campo como una línea "etiqueta:" seguida de su
    valor en las líneas siguientes, en este orden exacto (comprobado con un correo
    real, 2026-08-28) -- "nombre:\\nJUAN\\n\\n\\nemail:\\n...". Devuelve None si el
    cuerpo no tiene esta forma (cualquier otro correo -- newsletters, proveedores,
    clientes escribiendo directo -- se queda con el snippet de Gmail de siempre, sin
    tocar)."""
    clave_actual: str | None = None
    valor_actual: list[str] = []
    campos: dict[str, str] = {}
    for linea in cuerpo.splitlines():
        posible_clave = linea.strip().rstrip(":").lower()
        if linea.strip().endswith(":") and posible_clave in _CAMPOS_FORMULARIO_CONTACTO:
            if clave_actual:
                campos[clave_actual] = "\n".join(valor_actual).strip()
            clave_actual, valor_actual = posible_clave, []
        elif clave_actual:
            valor_actual.append(linea)
    if clave_actual:
        campos[clave_actual] = "\n".join(valor_actual).strip()
    return campos if "nombre" in campos and "tipo" in campos else None


def _texto_plano(parte: dict) -> str | None:
    """Busca la parte text/plain de un mensaje MIME (puede venir anidada dentro de
    multipart/alternative) y la decodifica de base64url."""
    if parte.get("mimeType") == "text/plain" and parte.get("body", {}).get("data"):
        b64 = parte["body"]["data"]
        return base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8", errors="replace")
    for sub in parte.get("parts") or []:
        texto = _texto_plano(sub)
        if texto is not None:
            return texto
    return None


async def _resumen_formspree(cliente: httpx.AsyncClient, cabeceras: dict, id_: str) -> tuple[str, str] | None:
    """Para un aviso de Formspree del formulario de contacto -- Ariadna, 2026-08-28:
    "el texto que se puede ver en la app no es nada útil" (viendo "Formspree
    <noreply@formspree.io> · You've received a new form submission...", el propio
    snippet de Gmail, generado del principio del cuerpo antes de llegar a los campos
    reales). Pide el cuerpo completo (una llamada aparte -- solo para Formspree, no
    para las otras ~20 llamadas de correos_pendientes, que no lo necesitan) y lo
    traduce al mismo "{categoría} — {nombre}" / mensaje real que ya usa la app en
    Avisos (ver tituloConCategoria/mensajeReal en avisos-pendientes.tsx)."""
    detalle = await cliente.get(
        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{id_}",
        headers=cabeceras,
        params={"format": "full"},
    )
    detalle.raise_for_status()
    cuerpo = _texto_plano(detalle.json().get("payload", {}))
    if cuerpo is None:
        return None
    campos = _parsear_formulario_contacto(cuerpo)
    if campos is None:
        return None
    etiqueta = _TIPO_LABEL.get(campos.get("tipo", ""), "Contacto")
    return f"{etiqueta} — {campos.get('nombre') or 'Sin nombre'}", campos.get("descripcion") or ""


async def _detalle_correo(cliente: httpx.AsyncClient, cabeceras: dict, id_: str) -> CorreoPendiente:
    detalle = await cliente.get(
        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{id_}",
        headers=cabeceras,
        params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
    )
    detalle.raise_for_status()
    datos = detalle.json()
    cabeceras_msg = {h["name"]: h["value"] for h in datos.get("payload", {}).get("headers", [])}
    de = cabeceras_msg.get("From", "?")
    asunto = cabeceras_msg.get("Subject", "(sin asunto)")
    resumen = html.unescape(datos.get("snippet", ""))

    if "formspree.io" in de.lower():
        try:
            resumen_formspree = await _resumen_formspree(cliente, cabeceras, id_)
        except httpx.HTTPError:
            resumen_formspree = None
        if resumen_formspree:
            asunto, resumen = resumen_formspree

    return CorreoPendiente(id=id_, de=de, asunto=asunto, resumen=resumen, fecha=cabeceras_msg.get("Date", ""))


async def correos_pendientes(limite: int = 20) -> tuple[list[CorreoPendiente], bool]:
    """Devuelve (correos, conectado) -- correos sin leer de la bandeja de entrada
    (categoría principal, no promociones/social -- ver la query `category:primary`)."""
    token = await google_auth.access_token()
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

            # Ariadna, 2026-08-25: un correo que ninuma-agente ya clasificó y resolvió
            # del todo (p.ej. el aviso de Formspree de un contacto que la web ya creó
            # directamente) se quedaba aquí para siempre sin ninguna acción posible --
            # solo desaparecía si se marcaba leído a mano en Gmail. Se filtran antes de
            # gastar una llamada a la API de detalle por cada uno.
            resueltos = set(await panel_agente.gmail_ids_resueltos(ids))
            ids = [id_ for id_ in ids if id_ not in resueltos]

            # En paralelo, no una por una -- con la bandeja llena esto eran fácilmente
            # 15-20 llamadas secuenciales de ida y vuelta a Gmail (revisión de calidad
            # de código, 2026-08-27). asyncio.gather conserva el orden de `ids`, y si
            # cualquiera falla se relanza esa misma excepción tal cual antes.
            correos = list(await asyncio.gather(*(_detalle_correo(cliente, cabeceras, id_) for id_ in ids)))
    except httpx.HTTPError:
        return [], False

    return correos, True
