import os
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate .env file automatically (in current directory or any parent directory)
dotenv_path = find_dotenv(usecwd=True)
if dotenv_path:
    load_dotenv(dotenv_path)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=dotenv_path if dotenv_path else ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    PROJECT_NAME: str = "Rowing Club Sports Management"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    DATABASE_URL: str
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    def validate_production(self):
        if self.ENVIRONMENT.lower() == "production" and self.SECRET_KEY == "change-me-in-production":
            raise ValueError("SECRET_KEY must be configured for production")
        return self

settings = Settings().validate_production()
