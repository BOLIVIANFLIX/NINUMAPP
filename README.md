# NINUMAPP

App de gestión del negocio NINUMÁ (React Native + Expo, Android e iOS) con backend
propio en Python/FastAPI. **Proyecto totalmente independiente de `ninuma-agente`** (la
app web/TWA actual) — no comparte código, base de datos ni infraestructura con ella;
solo se usa como referencia de qué funciones tiene que cubrir.

Uso interno (dos personas), sin publicar en Play Store por ahora.

## Estructura

```
.
├── src/            # App móvil (Expo Router, TypeScript)
└── backend/        # API propia (FastAPI + SQLAlchemy), su propia base de datos
```

## Arquitectura

- **Backend propio**, pensado para desplegarse en un VPS (no en la Raspberry) —
  habla con Home Assistant y Grocy por red (igual que hace `ninuma-agente` hoy), pero
  cada llamada está protegida: si esos servicios no responden, esa sección se queda
  "sin datos" y el resto de la app sigue funcionando con normalidad.
- **Base de datos propia** (SQLite en desarrollo, Postgres en producción).
- **Login con doble factor (TOTP) obligatorio** y bloqueo por fuerza bruta, mismo
  nivel de seguridad que ya se auditó en `ninuma-agente` (ver `backend/app/auth.py`).
- Objetivo a largo plazo: si el proyecto funciona bien, sustituye por completo a la
  app web/TWA actual.

## Desarrollo

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt   # Windows
venv\Scripts\python crear_usuario.py <usuario> <password>
venv\Scripts\python -m uvicorn app.main:app --reload
```

### App móvil

```bash
npm install
npx expo start
```

En desarrollo, la app apunta al backend local (`localhost:8000` / `10.0.2.2:8000` en
el emulador Android). Cuando haya un VPS, se configura vía `EXPO_PUBLIC_API_URL`.
