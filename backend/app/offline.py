"""Soporte para la cola de acciones sin conexión del móvil (ver
src/lib/action-queue.ts) -- convención compartida para que cualquier endpoint de
escritura futuro (crear un pedido, marcar algo cobrado...) pueda aceptar el momento
real en que ocurrió la acción en el móvil, en vez de asumir que fue "ahora mismo" en
el servidor (que sería la hora en que por fin hay cobertura, no la hora real).

Uso en un endpoint nuevo:

    class CrearPedidoBody(BaseModel):
        cliente: str
        ...
        client_timestamp: datetime | None = None

    @router.post("/pedidos")
    async def crear_pedido(body: CrearPedidoBody, ...):
        fecha = resolver_fecha(body.client_timestamp)
        ...

El servidor sigue siendo la fuente de la verdad para todo lo demás (precios, stock,
permisos) -- client_timestamp SOLO decide con qué fecha queda registrada la acción,
nunca se confía en el móvil para nada que afecte a la lógica de negocio."""

from datetime import datetime, timezone


def resolver_fecha(client_timestamp: datetime | None) -> datetime:
    """Si el móvil mandó cuándo ocurrió de verdad la acción (offline, encolada, y
    despachada más tarde), se usa esa fecha. Si no, la de ahora mismo -- el caso
    normal, con conexión."""
    if client_timestamp is None:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    if client_timestamp.tzinfo is not None:
        client_timestamp = client_timestamp.astimezone(timezone.utc).replace(tzinfo=None)
    return client_timestamp
