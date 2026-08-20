# Desplegar NINUMAPP en el VPS

Pasos para cuando el servidor (Oracle Cloud, Ubuntu) ya exista y tengamos su IP
pública. Todo esto se hace **una vez**; después, actualizar es solo `git pull` +
`docker compose up -d --build`.

## 1. Apuntar el dominio al servidor

En el gestor DNS de `tunga.es` (donde ya están `ha.tunga.es`, `grocy.tunga.es`, etc.):
crear un registro **A** nuevo:

- Nombre: `ninumapp`
- Tipo: `A`
- Valor: la IP pública del VPS
- TTL: automático/por defecto

Con eso, `ninumapp.tunga.es` apuntará al servidor (puede tardar unos minutos en
propagarse).

## 2. Conectarse por SSH e instalar Docker

```bash
ssh ubuntu@<IP_DEL_VPS>

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# cerrar sesión y volver a entrar para que el grupo se aplique
```

## 3. Clonar el repositorio

```bash
git clone https://github.com/BOLIVIANFLIX/NINUMAPP.git
cd NINUMAPP
```

## 4. Configurar los secretos

```bash
cp .env.deploy.example .env
# editar .env -- poner una POSTGRES_PASSWORD real:
# openssl rand -hex 24

cp backend/.env.example backend/.env
# editar backend/.env con los valores reales:
#  - DATABASE_URL=postgresql+asyncpg://ninumapp:LA_MISMA_PASSWORD_DE_ARRIBA@db:5432/ninumapp
#  - JWT_SECRET real -- generar con: python3 -c "import secrets; print(secrets.token_urlsafe(48))"
#  - ALLOWED_ORIGINS=https://ninumapp.tunga.es
#  - HA_TOKEN, HA_URL, GROCY_URL, GROCY_API_KEY, GEMINI_API_KEY, GOOGLE_CLIENT_ID,
#    GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SUPABASE_DB_* -- los mismos valores
#    que ya están en SECRETOS-LOCALES.txt / backend/.env del ordenador de desarrollo
```

## 5. Levantar todo

```bash
docker compose up -d --build
```

Caddy pedirá el certificado HTTPS automáticamente para `ninumapp.tunga.es` la
primera vez que reciba tráfico (necesita el DNS del paso 1 ya propagado).

## 6. Crear el usuario de la app

```bash
docker compose exec backend python crear_usuario.py ariadna "LA-CONTRASEÑA-QUE-QUIERAS"
```

## 7. Comprobar

```bash
curl https://ninumapp.tunga.es/api/salud
# {"ok": true}
```

Y cambiar `EXPO_PUBLIC_API_URL` en el `.env` del ordenador de desarrollo (o en la
build final de la app) a `https://ninumapp.tunga.es`.

## Actualizar más adelante

```bash
cd NINUMAPP
git pull
docker compose up -d --build
```
