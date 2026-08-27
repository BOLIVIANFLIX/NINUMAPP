from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_JWT_SECRET_INSEGURO = "SOLO-PARA-DESARROLLO-CAMBIAR-EN-.ENV"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite en local para desarrollo, Postgres en el VPS de producción -- mismo
    # código, solo cambia esta variable de entorno. Ver README.md.
    database_url: str = "sqlite+aiosqlite:///./ninumapp.db"

    # Home Assistant y Grocy viven en la Raspberry (fuera de este proyecto) -- se
    # llaman por red igual que hace ninuma-agente hoy, pero cada llamada está
    # protegida (ver services/ha.py y services/grocy.py): si no responden, esa
    # sección concreta se queda "sin datos" y el resto de la app sigue funcionando.
    ha_url: str = ""
    ha_token: str = ""
    grocy_url: str = ""
    grocy_api_key: str = ""

    # Gemini (capa gratuita) para leer tickets de compra y albaranes con la cámara --
    # ver services/gemini.py. Igual que HA/Grocy: si no está configurada, Inventario
    # avisa en vez de romper el resto de la app.
    gemini_api_key: str = ""

    # OAuth de Google (Gmail, solo lectura) -- ver services/gmail.py. client_id/secret
    # vienen de un ID de cliente de OAuth tipo "Aplicación de escritorio" en Google
    # Cloud Console. refresh_token se obtiene una única vez, a mano, autorizando la
    # app (ver el flujo en gmail.py) -- no hay login por usuario dentro de NINUMAPP,
    # es una única cuenta de correo (la del negocio) autorizada de antemano.
    google_client_id: str = ""
    google_client_secret: str = ""
    gmail_refresh_token: str = ""
    google_calendar_id: str = ""

    # Conexión de solo lectura a la Supabase de la web (proyecto NINUMAWEB/WBD,
    # fuera de este repo) -- rol dedicado "ninumapp_lectura" (ver
    # WBD/supabase/migrations/038_rol_lectura_ninumapp.sql), nunca la service_role
    # key. Igual que HA/Grocy: si no está configurada, Pedidos se queda "sin datos"
    # en vez de romper el resto de la app.
    supabase_db_host: str = ""
    supabase_db_port: int = 5432
    supabase_db_name: str = "postgres"
    supabase_db_user: str = "ninumapp_lectura"
    supabase_db_password: str = ""

    # Login: mismo criterio que ninuma-agente (ver auditoría de seguridad
    # 2026-08-19) -- bloqueo tras varios intentos fallidos, doble factor obligatorio.
    login_max_intentos: int = 5
    login_ventana_minutos: int = 15

    # Cifras financieras y clientes profesionales viven en la SQLite de ninuma-agente
    # (proyecto aparte, en la Raspberry), no en Supabase ni en la BD propia de
    # NINUMAPP -- se leen vía los endpoints /api/ninumapp/* que expone ese proyecto
    # (ver ninuma-agente/api_ninumapp.py), autenticados con este mismo secreto
    # compartido. Igual que el resto de integraciones externas: sin configurar, esa
    # sección se queda "sin datos" en vez de romper el resto de la app.
    panel_agente_url: str = ""
    ninumapp_api_secret: str = ""

    # NINUMAPP solo tiene lectura en Supabase (rol ninumapp_lectura, ver arriba) --
    # para confirmar una fecha en una solicitud desde "Correo sin resolver" hace
    # falta pasar por la propia web (WBD), que sí puede escribir, vía
    # /api/ninumapp-agendar con este mismo NINUMAPP_API_SECRET. Ver
    # app/services/avisos.py.
    wbd_url: str = "https://www.ninuma.es"

    # Access Token (JWT, corto) + Refresh Token (opaco, largo) -- ver app/auth.py.
    # jwt_secret debe fijarse de verdad en producción (.env) -- el valor por defecto
    # solo vale para desarrollo local, nunca desplegar con este.
    jwt_secret: str = _JWT_SECRET_INSEGURO
    access_token_minutos: int = 20
    refresh_token_dias: int = 60

    @model_validator(mode="after")
    def _jwt_secret_no_inseguro_en_produccion(self) -> "Settings":
        # database_url es la misma señal dev/prod que ya usa el resto del código
        # (ver comentario arriba): sqlite = local, Postgres = VPS de producción.
        # Si arranca contra Postgres sin JWT_SECRET fijado en .env, cualquiera
        # podría forjar tokens válidos con este secreto público -- mejor no
        # arrancar que arrancar inseguro.
        if self.jwt_secret == _JWT_SECRET_INSEGURO and not self.database_url.startswith("sqlite"):
            raise ValueError(
                "JWT_SECRET no está configurado (usando el valor de desarrollo por defecto) "
                "en un entorno que no es SQLite local. Fija JWT_SECRET en .env antes de desplegar."
            )
        return self

    # "*" en desarrollo (Expo corre en orígenes variables: localhost, la IP del
    # emulador, etc.). En producción se fija a la lista real separada por comas
    # (p.ej. "https://ninumapp.tunga.es") vía ALLOWED_ORIGINS en .env.
    allowed_origins: str = "*"

    @property
    def lista_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
