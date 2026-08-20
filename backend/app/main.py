from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, resumen


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="NINUMAPP API", lifespan=lifespan)

# En desarrollo la app de Expo corre en el propio ordenador/emulador -- orígenes
# variables. Restringir esto de verdad cuando haya un dominio fijo en el VPS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(resumen.router)


@app.get("/api/salud")
async def salud():
    return {"ok": True}
