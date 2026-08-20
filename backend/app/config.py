from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Login: mismo criterio que ninuma-agente (ver auditoría de seguridad
    # 2026-08-19) -- bloqueo tras varios intentos fallidos, doble factor
    # obligatorio, sesión sin caducar sola.
    login_max_intentos: int = 5
    login_ventana_minutos: int = 15


settings = Settings()
