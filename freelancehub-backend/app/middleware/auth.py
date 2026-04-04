# app/middleware/auth.py
# Authentification : JWT (optionnel) OU en-tête X-User-Id (utilisateur actif en base).

import json
from functools import wraps

from bson import ObjectId
from flask import g, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app import mongo


def _parse_jwt_raw(raw) -> dict:
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw if isinstance(raw, dict) else {}


def resolve_identity():
    """
    Identité depuis un Bearer JWT valide, sinon depuis X-User-Id (MongoDB user actif).
    """
    try:
        verify_jwt_in_request(optional=True)
        raw = get_jwt_identity()
        if raw is not None:
            parsed = _parse_jwt_raw(raw)
            if parsed.get('id'):
                return parsed
    except Exception:
        pass

    uid_header = (request.headers.get('X-User-Id') or '').strip()
    if uid_header:
        try:
            oid = ObjectId(uid_header)
        except Exception:
            return None
        user = mongo.db.users.find_one({'_id': oid, 'is_active': True})
        if user:
            return {
                'id': str(user['_id']),
                'role': user.get('role', ''),
                'email': user.get('email', ''),
            }
    return None


def _ensure_identity():
    ident = getattr(g, '_auth_identity', None)
    if ident is not None:
        return ident
    ident = resolve_identity()
    if ident:
        g._auth_identity = ident
    return ident


def token_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        ident = resolve_identity()
        if not ident:
            return jsonify({'error': 'Authentification requise'}), 401
        g._auth_identity = ident
        return fn(*args, **kwargs)
    return wrapper


def _get_identity() -> dict:
    ident = getattr(g, '_auth_identity', None)
    if ident:
        return ident
    try:
        verify_jwt_in_request(optional=True)
        raw = get_jwt_identity()
        if raw is None:
            return {}
        return _parse_jwt_raw(raw)
    except Exception:
        return {}


def client_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        ident = _ensure_identity()
        if not ident:
            return jsonify({'error': 'Authentification requise'}), 401
        if ident.get('role') != 'client':
            return jsonify({'error': 'Accès réservé aux clients'}), 403
        return fn(*args, **kwargs)
    return wrapper


def freelancer_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        ident = _ensure_identity()
        if not ident:
            return jsonify({'error': 'Authentification requise'}), 401
        if ident.get('role') != 'freelancer':
            return jsonify({'error': 'Accès réservé aux freelancers'}), 403
        return fn(*args, **kwargs)
    return wrapper
