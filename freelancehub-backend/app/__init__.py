# app/__init__.py
# ══════════════════════════════════════════════════════════════════════════
#  Application Factory — Freelance Marketplace
#  Stack : Flask · Flask-PyMongo · Flask-JWT-Extended · Flask-CORS
# ══════════════════════════════════════════════════════════════════════════

from flask        import Flask
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager
from flask_cors   import CORS

# ── Extensions (initialised without app) ─────────────────────────────────
mongo = PyMongo()
jwt   = JWTManager()


def create_app(config_name: str = 'development') -> Flask:
    """
    Application factory.
    Usage:
        app = create_app()               # development (default)
        app = create_app('production')
        app = create_app('testing')
    """
    app = Flask(__name__)

    # ── Load config ───────────────────────────────────────────────────────
    from app.config import config_map
    app.config.from_object(config_map[config_name])

    # ── Init extensions ───────────────────────────────────────────────────
    mongo.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={
        r'/api/*': {
            'origins': app.config['CORS_ORIGINS'],
            'allow_headers': ['Content-Type', 'Authorization', 'X-User-Id'],
        }
    })

    # ── JWT error handlers ────────────────────────────────────────────────
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        from flask import jsonify
        return jsonify({'error': 'Token expiré', 'code': 'TOKEN_EXPIRED'}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        from flask import jsonify
        return jsonify({'error': 'Token invalide', 'code': 'TOKEN_INVALID'}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        from flask import jsonify
        return jsonify({'error': 'Token manquant', 'code': 'TOKEN_MISSING'}), 401

    # ── Register blueprints ───────────────────────────────────────────────
    _register_blueprints(app)

    # ── Health-check route ────────────────────────────────────────────────
    @app.route('/api/health')
    def health():
        from flask import jsonify
        try:
            mongo.db.command('ping')
            db_status = 'connected'
        except Exception:
            db_status = 'disconnected'
        return jsonify({'status': 'ok', 'db': db_status, 'env': config_name})

    return app


def _register_blueprints(app: Flask) -> None:
    """Register all route blueprints under /api prefix."""

    from app.routes.users      import users_bp, auth_bp
    from app.routes.projects   import projects_bp
    from app.routes.categories import categories_bp
    from app.routes.payments   import payments_bp
    from app.routes.messages   import messages_bp

    app.register_blueprint(auth_bp,       url_prefix='/api/auth')
    app.register_blueprint(users_bp,      url_prefix='/api/users')
    app.register_blueprint(projects_bp,   url_prefix='/api/projects')
    app.register_blueprint(categories_bp, url_prefix='/api/categories')
    app.register_blueprint(payments_bp,   url_prefix='/api/payments')
    app.register_blueprint(messages_bp,   url_prefix='/api/messages')