import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / '.env', override=True)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    MONGODB_URI = os.environ.get('MONGODB_URI')
    MONGODB_DB_NAME = os.environ.get('MONGODB_DB_NAME') or 'exam_monitoring'

    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-change-in-production'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # Email configuration
    SMTP_SERVER = os.environ.get('SMTP_SERVER') or 'smtp.gmail.com'
    SMTP_PORT = int(os.environ.get('SMTP_PORT') or 587)
    SMTP_USERNAME = os.environ.get('SMTP_USERNAME')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')

    # Application URLs
    FRONTEND_URL = os.environ.get('FRONTEND_URL') or 'http://localhost:3000'
    BACKEND_URL = os.environ.get('BACKEND_URL') or 'http://localhost:5000'

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    MONGODB_URI = 'mongodb://localhost:27017/test_exam_monitoring'
    MONGODB_DB_NAME = 'test_exam_monitoring'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
