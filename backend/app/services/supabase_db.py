"""Conexión de solo lectura compartida a la Supabase de la web (proyecto
NINUMAWEB/WBD, fuera de este repo) -- rol dedicado `ninumapp_lectura` (ver
WBD/supabase/migrations/038_rol_lectura_ninumapp.sql), nunca la service_role key.
Usada por pedidos.py y avisos.py, que leen de las mismas tablas (orders/profiles)
con reglas de negocio distintas.

Pool de conexiones, no una conexión nueva por lectura -- antes cada llamada abría y
cerraba su propia conexión TCP+autenticación a Supabase desde cero (revisión de
calidad de código, 2026-08-27); ahora se reutiliza un pool ya autenticado, creado la
primera vez que hace falta."""

import asyncio
from contextlib import asynccontextmanager

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


def configurada() -> bool:
    return bool(settings.supabase_db_host and settings.supabase_db_password)


async def _obtener_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:  # otra corrutina pudo haberlo creado mientras esperábamos el lock
                _pool = await asyncpg.create_pool(
                    host=settings.supabase_db_host,
                    port=settings.supabase_db_port,
                    database=settings.supabase_db_name,
                    user=settings.supabase_db_user,
                    password=settings.supabase_db_password,
                    min_size=1,
                    max_size=5,
                    timeout=5,
                    command_timeout=10,
                )
    return _pool


@asynccontextmanager
async def conexion():
    """`async with supabase_db.conexion() as conn:` -- conn es una conexión prestada
    del pool, se devuelve sola al salir del bloque (nunca hace falta cerrarla a mano)."""
    pool = await _obtener_pool()
    async with pool.acquire() as conn:
        yield conn
