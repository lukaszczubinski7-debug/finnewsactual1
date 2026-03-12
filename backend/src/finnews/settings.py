from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
    )

    # Axesso
    axesso_api_key: str = Field(default="", alias="AXESSO_API_KEY")
    axesso_api_key_header: str = Field(default="axesso-api-key", alias="AXESSO_API_KEY_HEADER")
    axesso_api_key_prefix: str = Field(default="", alias="AXESSO_API_KEY_PREFIX")
    axesso_rapidapi_host: str = Field(default="", alias="AXESSO_RAPIDAPI_HOST")
    axesso_auth_mode: str = Field(default="auto", alias="AXESSO_AUTH_MODE")
    axesso_debug: bool = Field(default=False, alias="AXESSO_DEBUG")
    axesso_diagnose_max_attempts: int = Field(default=6, alias="AXESSO_DIAGNOSE_MAX_ATTEMPTS")
    axesso_try_subscription_key_param: bool = Field(default=False, alias="AXESSO_TRY_SUBSCRIPTION_KEY_PARAM")

    axesso_base_url: str = Field(default="https://api.axesso.de/yho", alias="AXESSO_BASE_URL")
    axesso_timeout_s: float = Field(default=15.0, alias="AXESSO_TIMEOUT_S")

    # LLM (opcjonalnie)
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini", alias="OPENAI_MODEL")
    llm_top_k: int = Field(default=5, alias="LLM_TOP_K")

    # App
    app_env: str = Field(default="dev", alias="APP_ENV")
    database_url: str = Field(default="sqlite:///./finnews.db", alias="DATABASE_URL")
    jwt_secret_key: str = Field(default="change-me-in-prod", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(default=60 * 24, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")


settings = Settings()
