# app/routes/users.py
from flask              import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token
from app                import mongo
from app.middleware.auth import token_required, freelancer_only, client_only, _get_identity
from bson               import ObjectId
from datetime           import datetime, timezone
import bcrypt
import re
import json

users_bp = Blueprint('users', __name__)


# ── Helper JWT ────────────────────────────────────────────────────────────
def _identity() -> dict:
    """Retourne toujours un dict — compatible sub str ou dict."""
    raw = get_jwt_identity()
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw or {}


# ── Helpers ───────────────────────────────────────────────────────────────
def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def _check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def _is_valid_email(email: str) -> bool:
    return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email))

def _user_public(u: dict) -> dict:
    u['id'] = str(u.pop('_id'))
    u.pop('password', None)
    u.pop('__v', None)
    return u

def _freelancer_public(f: dict) -> dict:
    f['id']      = str(f.pop('_id'))
    f['user_id'] = str(f.get('user_id', ''))
    return f

def _enrich_freelancer_mobile(f: dict) -> dict:
    hr = f.get('hourly_rate', 0) or 0
    try:
        hr = float(hr)
    except (TypeError, ValueError):
        hr = 0
    rc = f.get('reviews_count', f.get('review_count', 0))
    f['reviews']       = rc
    f['hourlyRateNum'] = hr
    f['hourlyRate']    = f'${int(hr)}/hr' if hr == int(hr) else f'${hr}/hr'
    f['completedJobs'] = f.get('completed_jobs', 0)
    f['isTopRated']    = f.get('is_top_rated', False)
    return f


# ══════════════════════════════════════════════════════════════════════════
auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    required = ['name', 'email', 'password', 'role']
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Champs manquants : {", ".join(missing)}'}), 400

    email = data['email'].strip().lower()
    if not _is_valid_email(email):
        return jsonify({'error': 'Email invalide'}), 400
    if len(data['password']) < 6:
        return jsonify({'error': 'Mot de passe trop court (min 6 caractères)'}), 400
    if data['role'] not in ('client', 'freelancer'):
        return jsonify({'error': 'Rôle invalide (client | freelancer)'}), 400
    if mongo.db.users.find_one({'email': email}):
        return jsonify({'error': 'Email déjà utilisé'}), 409

    now = datetime.now(timezone.utc)
    user = {
        'name':          data['name'].strip(),
        'email':         email,
        'password':      _hash_password(data['password']),
        'role':          data['role'],
        'avatar':        data.get('avatar', ''),
        'phone':         data.get('phone', ''),
        'trial_used':    False,
        'trial_used_at': None,
        'is_active':     True,
        'created_at':    now,
        'updated_at':    now,
    }

    result  = mongo.db.users.insert_one(user)
    user_id = str(result.inserted_id)

    if data['role'] == 'freelancer':
        mongo.db.freelancers.insert_one({
            'user_id':             ObjectId(user_id),
            'title':               data.get('title', ''),
            'bio':                 '',
            'skills':              [],
            'hourly_rate':         0,
            'location':            data.get('location', ''),
            'is_available':        True,
            'rating':              0.0,
            'reviews_count':       0,
            'completed_jobs':      0,
            'response_time':       '< 1h',
            'earnings_total':      0,
            'earnings_after_fees': 0,
            'platform_fees_paid':  0,
            'created_at':          now,
            'updated_at':          now,
        })

    # ← identity comme string JSON
    identity_dict = {'id': user_id, 'role': data['role'], 'email': email}
    access_token  = create_access_token(identity=json.dumps(identity_dict))
    refresh_token = create_refresh_token(identity=json.dumps(identity_dict))

    return jsonify({
        'message':       'Inscription réussie',
        'access_token':  access_token,
        'token':         access_token,
        'refresh_token': refresh_token,
        'user': {
            'id':         user_id,
            'name':       user['name'],
            'email':      email,
            'role':       data['role'],
            'trial_used': False,
        }
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data  = request.get_json()
    email = data.get('email', '').strip().lower()
    pwd   = data.get('password', '')

    if not email or not pwd:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    user = mongo.db.users.find_one({'email': email, 'is_active': True})
    if not user or not _check_password(pwd, user['password']):
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    user_id = str(user['_id'])

    # ← identity comme string JSON
    identity_dict = {'id': user_id, 'role': user['role'], 'email': email}
    access_token  = create_access_token(identity=json.dumps(identity_dict))
    refresh_token = create_refresh_token(identity=json.dumps(identity_dict))

    freelancer_profile = None
    if user['role'] == 'freelancer':
        fl = mongo.db.freelancers.find_one({'user_id': user['_id']})
        if fl:
            fl['id']      = str(fl.pop('_id'))
            fl['user_id'] = user_id
            freelancer_profile = fl

    return jsonify({
        'access_token':  access_token,
        'token':         access_token,
        'refresh_token': refresh_token,
        'user': {
            'id':         user_id,
            'name':       user['name'],
            'email':      email,
            'role':       user['role'],
            'avatar':     user.get('avatar', ''),
            'trial_used': user.get('trial_used', False),
            'freelancer': freelancer_profile,
        }
    })


@auth_bp.route('/refresh', methods=['POST'])
@token_required
def refresh_token_route():
    identity_dict = _get_identity()
    access_token  = create_access_token(identity=json.dumps(identity_dict))
    return jsonify({'access_token': access_token})


# ══════════════════════════════════════════════════════════════════════════
@users_bp.route('/me', methods=['GET'])
@token_required
def get_me():
    identity = _get_identity()
    user     = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    data = _user_public(user)
    if data['role'] == 'freelancer':
        fl = mongo.db.freelancers.find_one({'user_id': ObjectId(identity['id'])})
        if fl:
            data['freelancer'] = _freelancer_public(fl)

    return jsonify(data)


@users_bp.route('/me', methods=['PUT'])
@token_required
def update_me():
    identity = _get_identity()
    data     = request.get_json()
    now      = datetime.now(timezone.utc)

    user_fields = ['name', 'phone', 'avatar', 'gender', 'address']
    user_update = {k: data[k] for k in user_fields if k in data}
    user_update['updated_at'] = now

    if user_update:
        mongo.db.users.update_one(
            {'_id': ObjectId(identity['id'])},
            {'$set': user_update}
        )

    if identity['role'] == 'freelancer':
        fl_fields = ['title', 'bio', 'skills', 'hourly_rate',
                     'location', 'is_available', 'languages',
                     'education', 'experience', 'portfolio']
        fl_update = {k: data[k] for k in fl_fields if k in data}
        fl_update['updated_at'] = now
        if fl_update:
            mongo.db.freelancers.update_one(
                {'user_id': ObjectId(identity['id'])},
                {'$set': fl_update},
                upsert=True
            )

    return jsonify({'message': 'Profil mis à jour'})


@users_bp.route('/freelancers', methods=['GET'])
def list_freelancers():
    query        = {}
    keyword      = request.args.get('q')
    skill        = request.args.get('skill')
    available    = request.args.get('available')
    min_rate     = request.args.get('min_rate', type=float)
    max_rate     = request.args.get('max_rate', type=float)
    min_rating   = request.args.get('min_rating', type=float)
    category_slug= request.args.get('category')

    if category_slug:
        query['category'] = category_slug.strip().lower()
    if keyword:
        query['$or'] = [
            {'title':    {'$regex': keyword, '$options': 'i'}},
            {'bio':      {'$regex': keyword, '$options': 'i'}},
            {'skills':   {'$regex': keyword, '$options': 'i'}},
            {'location': {'$regex': keyword, '$options': 'i'}},
        ]
    if skill:
        query['skills'] = {'$regex': skill, '$options': 'i'}
    if available == 'true':
        query['is_available'] = True
    if min_rate is not None:
        query['hourly_rate'] = {'$gte': min_rate}
    if max_rate is not None:
        query.setdefault('hourly_rate', {})['$lte'] = max_rate
    if min_rating is not None:
        query['rating'] = {'$gte': min_rating}

    sort_map  = {'rating': 'rating', 'hourly_rate': 'hourly_rate',
                 'completed_jobs': 'completed_jobs', 'created_at': 'created_at'}
    sort_key  = sort_map.get(request.args.get('sort', 'rating'), 'rating')
    sort_dir  = -1 if request.args.get('order', 'desc') == 'desc' else 1
    page      = max(1, int(request.args.get('page', 1)))
    page_size = min(50, int(request.args.get('page_size', 20)))
    skip      = (page - 1) * page_size

    total       = mongo.db.freelancers.count_documents(query)
    freelancers = list(mongo.db.freelancers.find(query).sort(sort_key, sort_dir).skip(skip).limit(page_size))

    for f in freelancers:
        f['id']      = str(f.pop('_id'))
        f['user_id'] = str(f['user_id'])
        user = mongo.db.users.find_one({'_id': ObjectId(f['user_id'])}, {'name': 1, 'avatar': 1})
        if user:
            f['name']   = user.get('name', '')
            f['avatar'] = user.get('avatar', '')
        _enrich_freelancer_mobile(f)

    return jsonify({'freelancers': freelancers, 'total': total,
                    'page': page, 'page_size': page_size,
                    'pages': (total + page_size - 1) // page_size})


@users_bp.route('/freelancers/<freelancer_id>', methods=['GET'])
def get_freelancer(freelancer_id: str):
    try:
        oid = ObjectId(freelancer_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    fl = mongo.db.freelancers.find_one({'_id': oid})
    if not fl:
        fl = mongo.db.freelancers.find_one({'user_id': oid})
    if not fl:
        return jsonify({'error': 'Freelancer introuvable'}), 404

    fl = _freelancer_public(fl)
    _enrich_freelancer_mobile(fl)

    user = mongo.db.users.find_one(
        {'_id': ObjectId(fl['user_id'])},
        {'name': 1, 'avatar': 1, 'email': 1, 'created_at': 1}
    )
    if user:
        fl['name']        = user.get('name', '')
        fl['avatar']      = user.get('avatar', '')
        fl['member_since']= user.get('created_at', '')

    # Email / téléphone du freelance : uniquement si le visiteur est un client connecté (X-User-Id)
    x_uid = request.headers.get('X-User-Id')
    if x_uid:
        try:
            viewer = mongo.db.users.find_one({'_id': ObjectId(x_uid)}, {'role': 1})
            if viewer and viewer.get('role') == 'client':
                fu = mongo.db.users.find_one(
                    {'_id': ObjectId(fl['user_id'])},
                    {'email': 1, 'phone': 1},
                )
                if fu:
                    fl['contact_email'] = fu.get('email') or ''
                    fl['contact_phone'] = fu.get('phone') or ''
        except Exception:
            pass

    fid_profile = ObjectId(fl['id'])
    fid_user    = ObjectId(fl['user_id'])
    reviews     = list(mongo.db.reviews.find({'$or': [
        {'freelancer_id': fid_profile},
        {'freelancer_id': fid_user},
    ]}).sort('created_at', -1).limit(10))

    mobile_reviews = []
    for r in reviews:
        r['id']            = str(r.pop('_id'))
        r['freelancer_id'] = str(r['freelancer_id'])
        r['client_id']     = str(r.get('client_id', ''))
        r['project_id']    = str(r.get('project_id', ''))
        mobile_reviews.append({
            'name':    r.get('author_name', 'Client'),
            'project': r.get('project_title', ''),
            'avatar':  r.get('author_avatar', ''),
            'rating':  r.get('rating', 5),
            'comment': r.get('comment', ''),
        })

    fl['reviews_list'] = reviews
    fl['review_items'] = mobile_reviews
    return jsonify(fl)


@users_bp.route('/<user_id>', methods=['GET'])
def get_user(user_id: str):
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400
    user = mongo.db.users.find_one({'_id': oid})
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404
    return jsonify(_user_public(user))


@users_bp.route('/applications', methods=['GET'])
@token_required
@freelancer_only
def my_applications():
    identity = _get_identity()
    status   = request.args.get('status')

    uid    = ObjectId(identity['id'])
    fl_doc = mongo.db.freelancers.find_one({'user_id': uid})
    or_ids = [{'freelancer_id': uid}]
    if fl_doc:
        or_ids.append({'freelancer_id': fl_doc['_id']})
    query = {'$or': or_ids}
    if status:
        query['status'] = status

    apps = list(mongo.db.applications.find(query).sort('created_at', -1))
    for a in apps:
        a['id']            = str(a.pop('_id'))
        a['project_id']    = str(a['project_id'])
        a['client_id']     = str(a['client_id'])
        a['freelancer_id'] = str(a['freelancer_id'])

    return jsonify({'applications': apps, 'total': len(apps)})


@users_bp.route('/favorites', methods=['GET'])
@token_required
def list_favorites():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    entity_type = (request.args.get('type') or '').strip().lower()
    query = {'user_id': uid}
    if entity_type in ('project', 'freelancer'):
        query['entity_type'] = entity_type

    docs = list(mongo.db.favorites.find(query).sort('created_at', -1))
    items = []
    for doc in docs:
        item = {
            'id': str(doc.get('_id')),
            'entity_type': doc.get('entity_type', ''),
            'entity_id': str(doc.get('entity_id', '')),
            'created_at': doc.get('created_at'),
        }
        if item['entity_type'] == 'project':
            project = mongo.db.projects.find_one({'_id': doc.get('entity_id')})
            if project:
                item['project'] = _project_to_dict_min(project)
        elif item['entity_type'] == 'freelancer':
            freelancer = mongo.db.freelancers.find_one({'$or': [{'_id': doc.get('entity_id')}, {'user_id': doc.get('entity_id')}]})
            if freelancer:
                serialized = _freelancer_public(dict(freelancer))
                _enrich_freelancer_mobile(serialized)
                user = mongo.db.users.find_one({'_id': ObjectId(serialized['user_id'])}, {'name': 1, 'avatar': 1})
                if user:
                    serialized['name'] = user.get('name', '')
                    serialized['avatar'] = user.get('avatar', '')
                item['freelancer'] = serialized
        items.append(item)

    return jsonify({'favorites': items, 'total': len(items)})


@users_bp.route('/favorites/toggle', methods=['POST'])
@token_required
def toggle_favorite():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    data = request.get_json() or {}
    entity_type = (data.get('entity_type') or '').strip().lower()
    entity_id = data.get('entity_id')

    if entity_type not in ('project', 'freelancer'):
        return jsonify({'error': 'entity_type invalide'}), 400
    try:
        entity_oid = ObjectId(entity_id)
    except Exception:
        return jsonify({'error': 'entity_id invalide'}), 400

    query = {'user_id': uid, 'entity_type': entity_type, 'entity_id': entity_oid}
    existing = mongo.db.favorites.find_one(query)
    if existing:
        mongo.db.favorites.delete_one({'_id': existing['_id']})
        return jsonify({'favorited': False})

    mongo.db.favorites.insert_one({
        'user_id': uid,
        'entity_type': entity_type,
        'entity_id': entity_oid,
        'created_at': datetime.now(timezone.utc),
    })
    return jsonify({'favorited': True}), 201


@users_bp.route('/favorites/check', methods=['GET'])
@token_required
def check_favorite():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    entity_type = (request.args.get('entity_type') or '').strip().lower()
    entity_id = request.args.get('entity_id')
    if entity_type not in ('project', 'freelancer') or not entity_id:
        return jsonify({'favorited': False})
    try:
        entity_oid = ObjectId(entity_id)
    except Exception:
        return jsonify({'favorited': False})

    exists = mongo.db.favorites.find_one({'user_id': uid, 'entity_type': entity_type, 'entity_id': entity_oid})
    return jsonify({'favorited': bool(exists)})


@users_bp.route('/freelancers/<freelancer_id>/reviews', methods=['POST'])
@token_required
@client_only
def create_freelancer_review(freelancer_id: str):
    identity = _get_identity()
    data = request.get_json() or {}
    try:
        rating = int(data.get('rating', 0))
    except Exception:
        rating = 0
    comment = (data.get('comment') or '').strip()
    project_title = (data.get('project_title') or 'Client review').strip()

    if rating < 1 or rating > 5:
        return jsonify({'error': 'rating doit etre entre 1 et 5'}), 400
    if not comment:
        return jsonify({'error': 'comment requis'}), 400

    try:
        oid = ObjectId(freelancer_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    freelancer = mongo.db.freelancers.find_one({'$or': [{'_id': oid}, {'user_id': oid}]})
    if not freelancer:
        return jsonify({'error': 'Freelancer introuvable'}), 404

    client = mongo.db.users.find_one({'_id': ObjectId(identity['id'])}, {'name': 1, 'avatar': 1})
    now = datetime.now(timezone.utc)
    review = {
        'freelancer_id': freelancer.get('_id'),
        'client_id': ObjectId(identity['id']),
        'project_id': None,
        'project_title': project_title,
        'author_name': client.get('name', 'Client') if client else 'Client',
        'author_avatar': client.get('avatar', '') if client else '',
        'rating': rating,
        'comment': comment,
        'created_at': now,
        'updated_at': now,
    }
    result = mongo.db.reviews.insert_one(review)

    reviews = list(mongo.db.reviews.find({'freelancer_id': freelancer.get('_id')}))
    total = len(reviews)
    average = round(sum(float(item.get('rating', 0)) for item in reviews) / total, 1) if total else 0
    mongo.db.freelancers.update_one(
        {'_id': freelancer.get('_id')},
        {'$set': {'rating': average, 'review_count': total, 'reviews_count': total, 'updated_at': now}},
    )

    return jsonify({
        'message': 'Avis ajoute',
        'review_id': str(result.inserted_id),
        'rating': average,
        'reviews': total,
    }), 201


def _project_to_dict_min(project: dict) -> dict:
    return {
        'id': str(project.get('_id')),
        'title': project.get('title', ''),
        'category': project.get('category_name') or project.get('category_slug') or project.get('category', ''),
        'budget_min': project.get('budget_min', 0),
        'budget_max': project.get('budget_max', 0),
        'status': project.get('status', ''),
        'applicants_count': project.get('applicants_count', 0),
    }
