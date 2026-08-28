"""Envoltorio compartido para las respuestas "sin datos si no hay conexión" -- antes
cada router repetía a mano el mismo dict {clave: valor, "conectado": ..., "aviso":
...} (o su variante **datos) para HA/Grocy/Supabase/ninuma-agente/Gmail/Calendario
(revisión de calidad de código, 2026-08-27)."""


def con_estado(conectado: bool, mensaje_desconectado: str, **campos) -> dict:
    return {**campos, "conectado": conectado, "aviso": None if conectado else mensaje_desconectado}
