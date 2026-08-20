"""Script de un solo uso: crea el primer usuario de NINUMAPP (para desarrollo local).
Uso: venv/Scripts/python crear_usuario.py <usuario> <password>"""

import asyncio
import sys

from app import auth
from app.database import Base, SessionLocal, engine


async def main(usuario: str, password: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        existente = await auth.obtener_usuario(db, usuario)
        if existente:
            print(f"El usuario «{usuario}» ya existe.")
            return
        fila = await auth.crear_usuario(db, usuario, password)
        print(f"Usuario creado: {fila.usuario} (id {fila.id})")
        print("La primera vez que inicie sesión le pedirá configurar el doble factor (TOTP).")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python crear_usuario.py <usuario> <password>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
