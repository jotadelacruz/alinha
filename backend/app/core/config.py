from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    database_url: str
    supabase_url: str
    supabase_jwt_secret: str | None = None
    supabase_project_ref: str | None = None
    cors_origins: str = "http://localhost:5173"
    # Opcionais até a Julia criar a conta na Asaas e configurar o .env/Railway
    # — obrigatórios quebrariam a subida inteira da app (Settings() roda na
    # importação), o que não pode acontecer só porque billing ainda não está
    # configurado.
    asaas_api_key: str | None = None
    asaas_base_url: str = "https://api.asaas.com/v3"
    asaas_webhook_token: str | None = None
    asaas_plan_price: float = 98.90

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
