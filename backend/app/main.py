from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.config import settings
from app.database import Base, engine
from app.routers import analisis, auth, avisos, calendario, clientes, gmail, ingresos, inventario, obrador, pedidos, pedidos_b2b, pedidos_propios, precios_tienda, resumen, usuarios_panel


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="NINUMAPP API", lifespan=lifespan)

# "*" por defecto (desarrollo -- Expo corre en orígenes variables). En producción,
# ALLOWED_ORIGINS en .env lo restringe al dominio real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.lista_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Límite general por IP (no sustituye al bloqueo por fuerza bruta de app/auth.py,
# que es específico del login -- esto es un techo para el resto de la API, para que
# nada pueda machacarla con miles de peticiones seguidas). 120/min da margen de
# sobra a un uso normal (varias pantallas cargando datos a la vez).
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(auth.router)
app.include_router(resumen.router)
app.include_router(pedidos.router)
app.include_router(pedidos_b2b.router)
app.include_router(obrador.router)
app.include_router(avisos.router)
app.include_router(inventario.router)
app.include_router(clientes.router)
app.include_router(pedidos_propios.router)
app.include_router(gmail.router)
app.include_router(usuarios_panel.router)
app.include_router(calendario.router)
app.include_router(analisis.router)
app.include_router(ingresos.router)
app.include_router(precios_tienda.router)


@app.get("/api/salud")
async def salud():
    return {"ok": True}
