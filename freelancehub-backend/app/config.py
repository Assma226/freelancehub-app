# app/config.py
# ══════════════════════════════════════════════════════════════════════════
#  Configuration — Development · Production · Testing
# ══════════════════════════════════════════════════════════════════════════

import os
from datetime import timedelta


class BaseConfig:
    """Shared settings for all environments."""

    # ── Security ──────────────────────────────────────────────────────────
    SECRET_KEY              = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod-!!')
    JWT_SECRET_KEY          = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-in-prod-!!')
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

    # ── Commission model ──────────────────────────────────────────────────
    COMMISSION_TRIAL_RATE = 0.00   # 0%  — premier projet (essai gratuit)
    COMMISSION_BASIC_RATE = 0.05   # 5%  — plan Basic (client + freelancer)
    COMMISSION_PRO_RATE   = 0.03   # 3%  — plan Pro
    
    # ── Pagination ────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE     = 100
    
    # ── Upload ────────────────────────────────────────────────────────────
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024    # 10 MB
    UPLOAD_EXTENSIONS  = {'.jpg', '.jpeg', '.png', '.pdf', '.zip'}

# ── MongoDB ───────────────────────────────────────────────────────────
MONGO_URI = os.environ.get(
    'MONGO_URI',
    'mongodb+srv://Asma:asma2003@cluster0.6o1doob.mongodb.net/talent_db?retryWrites=true&w=majority'
)


class DevelopmentConfig(BaseConfig):
    """Local development — verbose logging, debug mode."""

    DEBUG   = True
    TESTING = False

    MONGO_URI = os.environ.get(
        'MONGO_URI',
        'mongodb+srv://Asma:asma2003@cluster0.6o1doob.mongodb.net/talent_db?retryWrites=true&w=majority'
    )

    # More generous token expiry for dev comfort
    JWT_ACCESS_TOKEN_EXPIRES  = timedelta(days=7)


class ProductionConfig(BaseConfig):
    """Production — strict, no debug."""

    DEBUG   = False
    TESTING = False

    # These MUST be set as environment variables in production
    SECRET_KEY     = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    MONGO_URI      = os.environ.get('MONGO_URI')

    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'https://yourdomain.com').split(',')


class TestingConfig(BaseConfig):
    """Automated tests — in-memory or dedicated test DB."""

    DEBUG   = False
    TESTING = True

    MONGO_URI = os.environ.get(
        'MONGO_URI_TEST',
        'mongodb+srv://Asma:asma2003@cluster0.6o1doob.mongodb.net/talent_db?retryWrites=true&w=majority'
    )

    # Disable token expiry during tests
    JWT_ACCESS_TOKEN_EXPIRES = False


# ── Lookup map used by create_app() ─────────────────────────────────────
config_map = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'testing':     TestingConfig,
    'default':     DevelopmentConfig,
}