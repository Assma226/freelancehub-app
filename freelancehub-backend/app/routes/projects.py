# app/routes/projects.py
# ══════════════════════════════════════════════════════════════════════════
#  Projects API
#
#  GET    /api/projects                → liste (filtrable, paginée)
#  POST   /api/projects                → créer un projet (client seulement)
#  GET    /api/projects/<id>           → détail d'un projet
#  PUT    /api/projects/<id>           → modifier (propriétaire seulement)
#  DELETE /api/projects/<id>           → supprimer (propriétaire seulement)
#  POST   /api/projects/<id>/apply     → soumettre un bid (freelancer)
#  GET    /api/projects/<id>/apply     → liste des candidatures (client)
#  PUT    /api/projects/<id>/apply/<app_id> → accepter / rejeter un bid
#  GET    /api/projects/my             → projets du client connecté
# ══════════════════════════════════════════════════════════════════════════

from flask               import Blueprint, request, jsonify
from app                 import mongo
from app.middleware.auth import token_required, client_only, freelancer_only, _get_identity
from bson                import ObjectId
from datetime            import datetime, timezone

projects_bp = Blueprint('projects', __name__)

COMMISSION_RATE = 0.05   # 5% par défaut (après essai gratuit)


# ── Helpers ───────────────────────────────────────────────────────────────

def _serialize_val(v):
    if isinstance(v, ObjectId):
        return str(v)
    if hasattr(v, 'isoformat') and callable(getattr(v, 'isoformat', None)):
        return v.isoformat()
    if isinstance(v, list):
        return [_serialize_val(x) for x in v]
    if isinstance(v, dict):
        return {k: _serialize_val(x) for k, x in v.items()}
    return v


def _project_to_dict(p: dict) -> dict:
    """Serialize a MongoDB project document + champs attendus par l'app Ionic."""
    doc = {k: _serialize_val(v) for k, v in p.items()}
    if '_id' in doc:
        doc['id'] = doc.pop('_id')
    elif 'id' not in doc and '_id' in p:
        doc['id'] = str(p['_id'])

    doc['client_id'] = str(doc.get('client_id', ''))

    # Aliases front (company / logo / compteurs)
    doc['company'] = doc.get('client_name') or doc.get('company', '')
    doc['companyLogo'] = doc.get('client_logo') or doc.get('company_logo', '')
    doc['applicants'] = doc.get('applicants_count', doc.get('applicants', 0))
    doc['category'] = (
        doc.get('category_name')
        or doc.get('category_slug')
        or doc.get('category', '')
    )
    doc['isVerified'] = doc.get('is_verified', False)
    doc['companyBio'] = doc.get('company_bio', doc.get('client_bio', ''))

    if not doc.get('requirements'):
        doc['requirements'] = []
    if not doc.get('responsibilities'):
        doc['responsibilities'] = []
    if doc.get('nice_to_have') and not doc.get('niceToHave'):
        doc['niceToHave'] = doc['nice_to_have']
    elif not doc.get('niceToHave'):
        doc['niceToHave'] = []

    if doc.get('created_at') and not doc.get('postedAt'):
        doc['postedAt'] = doc['created_at']

    if not doc.get('tags'):
        doc['tags'] = []

    return doc


def _paginate(query: dict):
    """Extract page / page_size from request args."""
    page      = max(1,  int(request.args.get('page', 1)))
    page_size = min(100, int(request.args.get('page_size', 20)))
    return page, page_size


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/projects   — liste filtrée & paginée
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('', methods=['GET'])
def list_projects():
    query = {}

    # ── Filtres query-string ─────────────────────────────────────────────
    category_id = request.args.get('category_id')
    slug        = request.args.get('category')
    keyword     = request.args.get('q')
    budget_min  = request.args.get('budget_min', type=float)
    budget_max  = request.args.get('budget_max', type=float)
    location    = request.args.get('location')
    status      = request.args.get('status')        # open | closed | in-progress

    if category_id:
        try:
            query['category_id'] = ObjectId(category_id)
        except Exception:
            pass

    or_category = None
    if slug and not category_id:
        cat = mongo.db.categories.find_one({'slug': slug})
        if cat:
            oid = cat['_id']
            or_category = [
                {'category_id': oid},
                {'category_slug': slug},
                {'category': slug},
            ]
        else:
            or_category = [{'category_slug': slug}, {'category': slug}]

    or_keyword = None
    if keyword:
        or_keyword = [
            {'title':       {'$regex': keyword, '$options': 'i'}},
            {'description': {'$regex': keyword, '$options': 'i'}},
            {'tags':        {'$regex': keyword, '$options': 'i'}},
        ]

    if or_category and or_keyword:
        query['$and'] = [{'$or': or_category}, {'$or': or_keyword}]
    elif or_category:
        query['$or'] = or_category
    elif or_keyword:
        query['$or'] = or_keyword

    if budget_min is not None:
        query.setdefault('budget_max', {})['$gte'] = budget_min

    if budget_max is not None:
        query.setdefault('budget_min', {})['$lte'] = budget_max

    if location:
        query['location'] = {'$regex': location, '$options': 'i'}

    if status:
        query['status'] = status
    else:
        query['status'] = 'open'

    # ── Tri ──────────────────────────────────────────────────────────────
    sort_field = request.args.get('sort', 'created_at')
    sort_dir   = -1 if request.args.get('order', 'desc') == 'desc' else 1

    sort_map = {
        'created_at':  'created_at',
        'budget_max':  'budget_max',
        'budget_min':  'budget_min',
        'applicants':  'applicants_count',
    }
    sort_key = sort_map.get(sort_field, 'created_at')

    # ── Pagination ───────────────────────────────────────────────────────
    page, page_size = _paginate(query)
    skip = (page - 1) * page_size

    total    = mongo.db.projects.count_documents(query)
    projects = list(
        mongo.db.projects.find(query)
                         .sort(sort_key, sort_dir)
                         .skip(skip)
                         .limit(page_size)
    )

    return jsonify({
        'projects':  [_project_to_dict(p) for p in projects],
        'total':     total,
        'page':      page,
        'page_size': page_size,
        'pages':     (total + page_size - 1) // page_size,
    })


# ══════════════════════════════════════════════════════════════════════════
#  POST /api/projects   — créer un projet (client seulement)
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('', methods=['POST'])
@token_required
@client_only
def create_project():
    identity = _get_identity()
    data     = request.get_json()

    # ── Validation ───────────────────────────────────────────────────────
    if not data.get('title'):
        return jsonify({'error': 'Champ manquant : title'}), 400

    try:
        budget_min = float(data['budget_min'])
        budget_max = float(data['budget_max'])
    except (ValueError, TypeError):
        return jsonify({'error': 'budget_min et budget_max doivent être des nombres'}), 400

    if budget_min > budget_max:
        return jsonify({'error': 'budget_min doit être ≤ budget_max'}), 400

    # ── Vérifier le statut trial du client ───────────────────────────────
    client    = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})
    trial_used = client.get('trial_used', False)

    # ── Résoudre la catégorie (category_id OU slug "category") ───────────
    category = None
    if data.get('category_id'):
        try:
            category = mongo.db.categories.find_one({'_id': ObjectId(data['category_id'])})
        except Exception:
            return jsonify({'error': 'category_id invalide'}), 400
    elif data.get('category'):
        slug = str(data['category']).strip().lower()
        category = mongo.db.categories.find_one({'slug': slug})

    if not category:
        return jsonify({'error': 'Catégorie introuvable (indiquez category ou category_id)'}), 404

    cat_id = category['_id']
    cat_label = category.get('name') or category.get('label', '')

    # ── Commission ───────────────────────────────────────────────────────
    commission_rate = 0.0 if not trial_used else COMMISSION_RATE
    is_trial        = not trial_used

    # ── Créer le document ────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    desc = (data.get('description') or '').strip()

    project = {
        'title':                data['title'].strip(),
        'description':          desc or '—',
        'budget_min':           budget_min,
        'budget_max':           budget_max,
        'category_id':          cat_id,
        'category_name':        cat_label,
        'category_slug':        category.get('slug', ''),
        'category':             category.get('slug', ''),
        'client_id':            ObjectId(identity['id']),
        'client_name':          client.get('name', ''),
        'client_logo':          client.get('avatar', ''),
        'company':              client.get('name', ''),
        'company_logo':         client.get('avatar', ''),
        'tags':                 [t.strip() for t in data.get('tags', []) if t.strip()],
        'location':             data.get('location', 'Remote'),
        'is_remote':            data.get('is_remote', True),
        'duration':             data.get('duration', ''),
        'deadline':             data.get('deadline', ''),
        'status':               'open',
        'applicants_count':     0,
        'is_trial_project':     is_trial,
        'commission_rate_client':     commission_rate,
        'commission_rate_freelancer': commission_rate,
        'requirements':         [],
        'responsibilities':     [],
        'created_at':           now,
        'updated_at':           now,
    }

    result = mongo.db.projects.insert_one(project)
    saved = mongo.db.projects.find_one({'_id': result.inserted_id})

    # ── Marquer le trial comme utilisé ───────────────────────────────────
    if not trial_used:
        mongo.db.users.update_one(
            {'_id': ObjectId(identity['id'])},
            {'$set': {'trial_used': True, 'trial_used_at': now}}
        )

    payload = _project_to_dict(saved)
    payload['message'] = 'Projet créé avec succès'
    payload['is_trial'] = is_trial
    payload['commission'] = commission_rate
    return jsonify(payload), 201


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/projects/<id>   — détail d'un projet
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>', methods=['GET'])
def get_project(project_id: str):
    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid, 'status': {'$ne': 'deleted'}})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404

    return jsonify(_project_to_dict(project))


# ══════════════════════════════════════════════════════════════════════════
#  PUT /api/projects/<id>   — modifier un projet
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>', methods=['PUT'])
@token_required
@client_only
def update_project(project_id: str):
    identity = _get_identity()

    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404

    if str(project['client_id']) != identity['id']:
        return jsonify({'error': 'Non autorisé — ce projet ne vous appartient pas'}), 403

    if project.get('status') in ('in-progress', 'completed'):
        return jsonify({'error': 'Impossible de modifier un projet en cours ou terminé'}), 400

    data    = request.get_json()
    allowed = ['title', 'description', 'budget_min', 'budget_max',
               'tags', 'location', 'is_remote', 'duration', 'deadline']

    updates = {k: data[k] for k in allowed if k in data}
    updates['updated_at'] = datetime.now(timezone.utc)

    mongo.db.projects.update_one({'_id': oid}, {'$set': updates})
    return jsonify({'message': 'Projet mis à jour'})


# ══════════════════════════════════════════════════════════════════════════
#  DELETE /api/projects/<id>   — soft-delete
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>', methods=['DELETE'])
@token_required
@client_only
def delete_project(project_id: str):
    identity = _get_identity()

    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404

    if str(project['client_id']) != identity['id']:
        return jsonify({'error': 'Non autorisé'}), 403

    mongo.db.projects.update_one(
        {'_id': oid},
        {'$set': {'status': 'deleted', 'updated_at': datetime.now(timezone.utc)}}
    )
    return jsonify({'message': 'Projet supprimé'})


# ══════════════════════════════════════════════════════════════════════════
#  POST /api/projects/<id>/apply   — soumettre un bid (freelancer)
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>/apply', methods=['POST'])
@token_required
@freelancer_only
def apply_project(project_id: str):
    identity = _get_identity()
    data     = request.get_json()

    # ── Validation ───────────────────────────────────────────────────────
    bid_amount   = data.get('bid_amount')
    cover_letter = data.get('cover_letter', '').strip()

    if not bid_amount or not cover_letter:
        return jsonify({'error': 'bid_amount et cover_letter sont requis'}), 400

    try:
        bid_amount = float(bid_amount)
        oid        = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'Paramètres invalides'}), 400

    # ── Vérifier le projet ───────────────────────────────────────────────
    project = mongo.db.projects.find_one({'_id': oid, 'status': 'open'})
    if not project:
        return jsonify({'error': 'Projet introuvable ou fermé'}), 404

    freelancer_id = identity['id']

    # ── Empêcher un double bid ───────────────────────────────────────────
    existing = mongo.db.applications.find_one({
        'project_id':    oid,
        'freelancer_id': ObjectId(freelancer_id),
    })
    if existing:
        return jsonify({'error': 'Vous avez déjà soumis un bid pour ce projet'}), 409

    # ── Vérifier le statut trial du freelancer ───────────────────────────
    freelancer_doc = mongo.db.freelancers.find_one({'user_id': ObjectId(freelancer_id)})
    user_doc       = mongo.db.users.find_one({'_id': ObjectId(freelancer_id)})
    trial_used     = user_doc.get('trial_used', False)
    is_trial       = not trial_used
    commission     = 0.0 if is_trial else COMMISSION_RATE
    net_amount     = bid_amount * (1 - commission)

    # ── Créer la candidature ─────────────────────────────────────────────
    now = datetime.now(timezone.utc)

    application = {
        'project_id':       oid,
        'project_title':    project['title'],
        'client_id':        project['client_id'],
        'freelancer_id':    ObjectId(freelancer_id),
        'freelancer_name':  user_doc.get('name', ''),
        'freelancer_avatar':user_doc.get('avatar', ''),
        'bid_amount':       bid_amount,
        'commission_rate':  commission,
        'net_amount':       net_amount,
        'is_trial':         is_trial,
        'cover_letter':     cover_letter,
        'status':           'pending',     # pending | accepted | rejected
        'created_at':       now,
        'updated_at':       now,
    }

    result = mongo.db.applications.insert_one(application)

    # ── Incrémenter le compteur de candidats ─────────────────────────────
    mongo.db.projects.update_one(
        {'_id': oid},
        {'$inc': {'applicants_count': 1}}
    )

    # ── Marquer trial utilisé pour le freelancer ─────────────────────────
    if is_trial:
        mongo.db.users.update_one(
            {'_id': ObjectId(freelancer_id)},
            {'$set': {'trial_used': True, 'trial_used_at': now}}
        )

    return jsonify({
        'message':        'Candidature soumise avec succès',
        'application_id': str(result.inserted_id),
        'is_trial':       is_trial,
        'commission':     commission,
        'bid_amount':     bid_amount,
        'net_amount':     round(net_amount, 2),
    }), 201


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/projects/<id>/apply   — liste des bids (client propriétaire)
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>/apply', methods=['GET'])
@token_required
@client_only
def get_applications(project_id: str):
    identity = _get_identity()

    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404

    if str(project['client_id']) != identity['id']:
        return jsonify({'error': 'Non autorisé'}), 403

    apps = list(mongo.db.applications.find({'project_id': oid}).sort('created_at', -1))

    for a in apps:
        a['id']            = str(a.pop('_id'))
        a['project_id']    = str(a['project_id'])
        a['client_id']     = str(a['client_id'])
        a['freelancer_id'] = str(a['freelancer_id'])

    return jsonify({'applications': apps, 'total': len(apps)})


# ══════════════════════════════════════════════════════════════════════════
#  PUT /api/projects/<id>/apply/<app_id>   — accepter / rejeter un bid
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>/apply/<app_id>', methods=['PUT'])
@token_required
@client_only
def review_application(project_id: str, app_id: str):
    identity = _get_identity()
    data     = request.get_json()
    action   = data.get('action')   # 'accept' | 'reject'

    if action not in ('accept', 'reject'):
        return jsonify({'error': 'action doit être "accept" ou "reject"'}), 400

    try:
        proj_oid = ObjectId(project_id)
        app_oid  = ObjectId(app_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': proj_oid})
    if not project or str(project['client_id']) != identity['id']:
        return jsonify({'error': 'Non autorisé'}), 403

    application = mongo.db.applications.find_one({'_id': app_oid, 'project_id': proj_oid})
    if not application:
        return jsonify({'error': 'Candidature introuvable'}), 404

    now        = datetime.now(timezone.utc)
    new_status = 'accepted' if action == 'accept' else 'rejected'

    mongo.db.applications.update_one(
        {'_id': app_oid},
        {'$set': {'status': new_status, 'updated_at': now}}
    )

    # Si accepté → passer le projet en "in-progress" et rejeter les autres bids
    if action == 'accept':
        mongo.db.projects.update_one(
            {'_id': proj_oid},
            {'$set': {
                'status':              'in-progress',
                'accepted_freelancer': application['freelancer_id'],
                'agreed_amount':       application['bid_amount'],
                'updated_at':          now,
            }}
        )
        # Rejeter automatiquement les autres candidatures
        mongo.db.applications.update_many(
            {'project_id': proj_oid, '_id': {'$ne': app_oid}},
            {'$set': {'status': 'rejected', 'updated_at': now}}
        )

    return jsonify({'message': f'Candidature {new_status}', 'status': new_status})


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/projects/my   — projets du client connecté
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/my', methods=['GET'])
@token_required
@client_only
def my_projects():
    identity = _get_identity()
    status   = request.args.get('status')

    query = {'client_id': ObjectId(identity['id']), 'status': {'$ne': 'deleted'}}
    if status:
        query['status'] = status

    projects = list(mongo.db.projects.find(query).sort('created_at', -1))
    return jsonify({'projects': [_project_to_dict(p) for p in projects]})