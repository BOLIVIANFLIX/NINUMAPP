"""Análisis financiero -- réplica de /panel/analisis (Resumen/Productos/Recetas/Precios),
mismas funciones de ninuma-agente vía panel_agente, nunca reimplementadas aquí."""

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.models import Usuario
from app.routers.auth import usuario_actual
from app.routers.errores import manejar_error as _manejar_error
from app.services import panel_agente

router = APIRouter(prefix="/api/analisis", tags=["analisis"])


@router.get("/resumen")
@_manejar_error
async def resumen(p: str = "mes", desde: str | None = None, hasta: str | None = None, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.analisis_resumen(p, desde, hasta)


@router.get("/productos")
@_manejar_error
async def productos(p: str = "mes", desde: str | None = None, hasta: str | None = None, usuario: Usuario = Depends(usuario_actual)):
    return {"ranking": await panel_agente.analisis_productos(p, desde, hasta)}


@router.get("/recetas")
@_manejar_error
async def recetas(usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.analisis_recetas()


@router.get("/precios")
@_manejar_error
async def precios(usuario: Usuario = Depends(usuario_actual)):
    return {"avisos": await panel_agente.analisis_precios()}


class GuardarConfigBody(BaseModel):
    precio_hora: float
    horas_mes: float


@router.post("/costes/guardar-config")
@_manejar_error
async def guardar_config(body: GuardarConfigBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.guardar_config_costes(body.precio_hora, body.horas_mes)


class GuardarTiempoBody(BaseModel):
    recipe_id: int
    minutos: int
    precio_hora: float


@router.post("/costes/guardar-tiempo")
@_manejar_error
async def guardar_tiempo(body: GuardarTiempoBody, usuario: Usuario = Depends(usuario_actual)):
    return await panel_agente.guardar_tiempo_receta(body.recipe_id, body.minutos, body.precio_hora)


@router.get("/iva-trimestre")
async def iva_trimestre(anio: int, trimestre: int, usuario: Usuario = Depends(usuario_actual)):
    """No sustituye al gestor -- ver ninuma-agente/inventario.iva_trimestre para el
    alcance real (todos los canales, criterio de caja, desde 2026-08-23)."""
    datos = await panel_agente.iva_trimestre(anio, trimestre)
    if datos is None:
        raise HTTPException(status_code=502, detail="No se ha podido calcular el IVA del trimestre.")
    return datos


@router.get("/modelo-130")
async def modelo_130(anio: int, trimestre: int, usuario: Usuario = Depends(usuario_actual)):
    """No sustituye al gestor -- ver ninuma-agente/inventario.modelo_130 para el
    alcance real (regla general, sin minoraciones especiales ni retenciones)."""
    datos = await panel_agente.modelo_130(anio, trimestre)
    if datos is None:
        raise HTTPException(status_code=502, detail="No se ha podido calcular el modelo 130 del trimestre.")
    return datos


@router.get("/copia-papel/descargar")
async def copia_papel_descargar(usuario: Usuario = Depends(usuario_actual)):
    """Última copia en papel semanal guardada (ver
    ninuma-agente/main.enviar_resumen_papel_semanal_si_toca) -- Ariadna, 2026-08-29:
    dejar de depender de Telegram para esto, descargable desde la app para imprimir."""
    resultado = await panel_agente.copia_papel_descargar()
    if resultado is None:
        raise HTTPException(status_code=502, detail="No se ha podido descargar la copia en papel.")
    contenido, content_type = resultado
    return Response(
        content=contenido,
        media_type=content_type,
        headers={"Content-Disposition": 'attachment; filename="copia_papel_semanal.pdf"'},
    )


@router.get("/trimestres-recientes")
async def trimestres_recientes(anio: int, trimestre: int, usuario: Usuario = Depends(usuario_actual)):
    datos = await panel_agente.trimestres_recientes(anio, trimestre)
    if datos is None:
        raise HTTPException(status_code=502, detail="No se ha podido calcular la comparativa de trimestres.")
    return datos
