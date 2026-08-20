"""Conexión de solo lectura compartida a la Supabase de la web (proyecto
NINUMAWEB/WBD, fuera de este repo) -- rol dedicado `ninumapp_lectura` (ver
WBD/supabase/migrations/038_rol_lectura_ninumapp.sql), nunca la service_role key.
Usada por pedidos.py y avisos.py, que leen de las mismas tablas (orders/profiles)
con reglas de negocio distintas."""

import asyncpg

from app.config import settings


async def conectar() -> asyncpg.Connection:
    return await asyncpg.connect(
        host=settings.supabase_db_host,
        port=settings.supabase_db_port,
        database=settings.supabase_db_name,
        user=settings.supabase_db_user,
        password=settings.supabase_db_password,
        timeout=5,
    )


def configurada() -> bool:
    return bool(settings.supabase_db_host and settings.supabase_db_password)
