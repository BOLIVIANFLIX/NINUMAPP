from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth, avisos, calendario, clientes, gmail, inventario, obrador, pedidos, pedidos_b2b, pedidos_propios, resumen, usuarios_panel


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


@app.get("/api/salud")
async def salud():
    return {"ok": True}
