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
from app.utils.notifications import create_notification
from bson                import ObjectId
from datetime            import datetime, timezone

projects_bp = Blueprint('projects', __name__)

COMMISSION_RATE = 0.05   # 5% par défaut (après essai gratuit)
ALLOWED_PROJECT_STATUSES = {'open', 'in-progress', 'completed', 'cancelled'}


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

    progress_entries = doc.get('progress_entries') or []
    total_hours_logged = 0.0
    total_tasks_completed = 0
    days_reported = set()
    progress_percent = 0
    latest_entry = None

    for entry in progress_entries:
        try:
            total_hours_logged += float(entry.get('hours_spent', 0) or 0)
        except (TypeError, ValueError):
            pass
        total_tasks_completed += len(entry.get('achievements') or [])
        if entry.get('work_date'):
            days_reported.add(entry.get('work_date'))
        try:
            progress_percent = max(progress_percent, int(entry.get('completion_percent', 0) or 0))
        except (TypeError, ValueError):
            pass
        latest_entry = entry

    doc['progress_entries'] = progress_entries
    doc['progress_percent'] = int(doc.get('progress_percent', progress_percent) or 0)
    doc['total_hours_logged'] = round(float(doc.get('total_hours_logged', total_hours_logged) or 0), 1)
    doc['total_tasks_completed'] = int(doc.get('total_tasks_completed', total_tasks_completed) or 0)
    doc['days_reported'] = int(doc.get('days_reported', len(days_reported)) or 0)
    doc['progress_last_updated_at'] = doc.get('progress_last_updated_at') or (latest_entry or {}).get('created_at')
    doc['progress_last_note'] = doc.get('progress_last_note') or (latest_entry or {}).get('summary', '')
    doc['progress_health'] = doc.get('progress_health', 'on-track')
    contract = doc.get('contract') or {}
    contract.setdefault('status', 'draft')
    contract.setdefault('amount', doc.get('agreed_amount', 0))
    contract.setdefault('start_date', '')
    contract.setdefault('due_date', '')
    contract.setdefault('terms', '')
    contract.setdefault('deliverables', [])
    contract.setdefault('client_signed_at', None)
    contract.setdefault('freelancer_signed_at', None)
    doc['contract'] = contract

    return doc


def _paginate(query: dict):
    """Extract page / page_size from request args."""
    page      = max(1,  int(request.args.get('page', 1)))
    page_size = min(100, int(request.args.get('page_size', 20)))
    return page, page_size


def _status_entry(status: str, actor_id, note: str = '') -> dict:
    return {
        'status': status,
        'note': note.strip(),
        'actor_id': actor_id,
        'created_at': datetime.now(timezone.utc),
    }


def _append_status_history(project_id, status: str, actor_id, note: str = '') -> None:
    mongo.db.projects.update_one(
        {'_id': project_id},
        {'$push': {'status_history': _status_entry(status, actor_id, note)}},
    )


def _project_actor_name(user_id) -> str:
    user = mongo.db.users.find_one({'_id': user_id}, {'name': 1})
    return (user or {}).get('name', 'Team member')


def _portfolio_item_from_project(project: dict) -> dict:
    budget_min = project.get('budget_min', 0) or 0
    budget_max = project.get('budget_max', 0) or 0
    agreed_amount = project.get('agreed_amount', 0) or 0
    metrics = 'Projet terminé'
    if agreed_amount:
        metrics = f"Budget ${int(agreed_amount)}"
    elif budget_min or budget_max:
        metrics = f"Budget ${int(budget_min)} - ${int(budget_max)}"

    return {
        'project_id': str(project.get('_id')),
        'title': project.get('title', ''),
        'category': project.get('category_name') or project.get('category_slug') or project.get('category', ''),
        'summary': project.get('description') or project.get('progress_last_note') or '',
        'metrics': metrics,
        'accent': '',
        'link': '',
        'cover_image': '',
        'source': 'project',
    }


def _find_freelancer_doc_for_project(project: dict):
    accepted = project.get('accepted_freelancer')
    if not accepted:
        return None

    try:
        accepted_oid = ObjectId(accepted) if not isinstance(accepted, ObjectId) else accepted
    except Exception:
        return None

    freelancer_doc = mongo.db.freelancers.find_one({'user_id': accepted_oid})
    if freelancer_doc:
        return freelancer_doc
    return mongo.db.freelancers.find_one({'_id': accepted_oid})


def _append_project_to_freelancer_portfolio(project: dict) -> None:
    freelancer_doc = _find_freelancer_doc_for_project(project)
    if not freelancer_doc:
        return

    portfolio = list(freelancer_doc.get('portfolio') or [])
    project_id = str(project.get('_id'))
    for item in portfolio:
        if str(item.get('project_id') or '') == project_id:
            return

    portfolio.append(_portfolio_item_from_project(project))
    mongo.db.freelancers.update_one(
        {'_id': freelancer_doc['_id']},
        {'$set': {'portfolio': portfolio, 'updated_at': datetime.now(timezone.utc)}},
    )


def _progress_entry(data: dict, identity: dict) -> dict:
    hours_spent = data.get('hours_spent', 0)
    try:
        hours_spent = round(max(float(hours_spent), 0), 1)
    except (TypeError, ValueError):
        hours_spent = 0.0

    completion_percent = data.get('completion_percent', 0)
    try:
        completion_percent = max(0, min(100, int(completion_percent)))
    except (TypeError, ValueError):
        completion_percent = 0

    achievements = [
        str(item).strip()
        for item in data.get('achievements', [])
        if str(item).strip()
    ]

    return {
        'work_date': str(data.get('work_date') or datetime.now(timezone.utc).date().isoformat()).strip(),
        'title': str(data.get('title') or 'Daily progress update').strip(),
        'summary': str(data.get('summary') or '').strip(),
        'achievements': achievements,
        'hours_spent': hours_spent,
        'completion_percent': completion_percent,
        'next_step': str(data.get('next_step') or '').strip(),
        'blockers': str(data.get('blockers') or '').strip(),
        'actor_id': ObjectId(identity['id']),
        'actor_role': identity.get('role', ''),
        'actor_name': _project_actor_name(ObjectId(identity['id'])),
        'created_at': datetime.now(timezone.utc),
    }


def _progress_summary(entries: list[dict]) -> dict:
    total_hours = 0.0
    total_tasks = 0
    progress_percent = 0
    days_reported = set()
    latest_entry = None

    for entry in entries:
        try:
            total_hours += float(entry.get('hours_spent', 0) or 0)
        except (TypeError, ValueError):
            pass
        total_tasks += len(entry.get('achievements') or [])
        if entry.get('work_date'):
            days_reported.add(entry.get('work_date'))
        try:
            progress_percent = max(progress_percent, int(entry.get('completion_percent', 0) or 0))
        except (TypeError, ValueError):
            pass
        latest_entry = entry

    return {
        'progress_percent': progress_percent,
        'total_hours_logged': round(total_hours, 1),
        'total_tasks_completed': total_tasks,
        'days_reported': len(days_reported),
        'progress_last_updated_at': (latest_entry or {}).get('created_at'),
        'progress_last_note': (latest_entry or {}).get('summary', ''),
    }


def _can_access_tracking(project: dict, identity: dict) -> bool:
    if str(project.get('client_id')) == identity['id']:
        return True

    accepted_freelancer = project.get('accepted_freelancer')
    if accepted_freelancer and str(accepted_freelancer) == identity['id']:
        return True

    freelancer_doc = mongo.db.freelancers.find_one({'user_id': ObjectId(identity['id'])}, {'_id': 1})
    return bool(freelancer_doc and accepted_freelancer == freelancer_doc.get('_id'))


def _can_access_contract(project: dict, identity: dict) -> bool:
    return _can_access_tracking(project, identity)


def _normalize_contract_payload(data: dict, project: dict) -> dict:
    deliverables = [
        str(item).strip()
        for item in data.get('deliverables', [])
        if str(item).strip()
    ]
    amount = data.get('amount', project.get('agreed_amount', 0))
    try:
        amount = round(max(float(amount), 0), 2)
    except (TypeError, ValueError):
        amount = round(float(project.get('agreed_amount', 0) or 0), 2)

    return {
        'status': 'pending-signature',
        'start_date': str(data.get('start_date') or '').strip(),
        'due_date': str(data.get('due_date') or '').strip(),
        'amount': amount,
        'terms': str(data.get('terms') or '').strip(),
        'deliverables': deliverables,
        'client_signed_at': datetime.now(timezone.utc),
        'freelancer_signed_at': None,
    }


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
        'status_history':       [_status_entry('open', ObjectId(identity['id']), 'Project created')],
        'progress_entries':     [],
        'progress_percent':     0,
        'total_hours_logged':   0,
        'total_tasks_completed': 0,
        'days_reported':        0,
        'progress_last_updated_at': None,
        'progress_last_note':   '',
        'progress_health':      'on-track',
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

    create_notification(
        user_id=project['client_id'],
        notif_type='application_received',
        title='New application',
        body=f"{user_doc.get('name', 'A freelancer')} applied to {project.get('title', 'your project')}.",
        actor_id=ObjectId(freelancer_id),
        entity_id=oid,
        entity_type='project',
        meta={
            'project_id': str(oid),
            'application_id': str(result.inserted_id),
        },
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
                'contract': {
                    'status': 'draft',
                    'amount': application['bid_amount'],
                    'start_date': '',
                    'due_date': '',
                    'terms': '',
                    'deliverables': [],
                    'client_signed_at': None,
                    'freelancer_signed_at': None,
                },
                'updated_at':          now,
            }}
        )
        # Rejeter automatiquement les autres candidatures
        mongo.db.applications.update_many(
            {'project_id': proj_oid, '_id': {'$ne': app_oid}},
            {'$set': {'status': 'rejected', 'updated_at': now}}
        )
        _append_status_history(proj_oid, 'in-progress', ObjectId(identity['id']), 'Freelancer application accepted')

    create_notification(
        user_id=application['freelancer_id'],
        notif_type='application_reviewed',
        title='Application update',
        body=f"Your application for {project.get('title', 'the project')} was {new_status}.",
        actor_id=project['client_id'],
        entity_id=proj_oid,
        entity_type='project',
        meta={
            'project_id': str(proj_oid),
            'application_id': str(app_oid),
            'status': new_status,
        },
    )

    return jsonify({'message': f'Candidature {new_status}', 'status': new_status})


@projects_bp.route('/<project_id>/status', methods=['PUT'])
@token_required
@client_only
def update_project_status(project_id: str):
    identity = _get_identity()
    data = request.get_json() or {}
    next_status = (data.get('status') or '').strip().lower()
    note = (data.get('note') or '').strip()

    if next_status not in ALLOWED_PROJECT_STATUSES:
        return jsonify({'error': 'Statut invalide'}), 400

    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404
    if str(project['client_id']) != identity['id']:
        return jsonify({'error': 'Non autorisé'}), 403

    current_status = project.get('status', 'open')
    allowed_transitions = {
        'open': {'cancelled'},
        'in-progress': {'completed', 'cancelled'},
        'cancelled': {'open'},
        'completed': set(),
    }
    if next_status == current_status:
        return jsonify({'message': 'Statut inchangé', 'status': current_status})
    if next_status not in allowed_transitions.get(current_status, set()):
        return jsonify({'error': f'Transition impossible de {current_status} vers {next_status}'}), 400

    now = datetime.now(timezone.utc)
    updates = {
        'status': next_status,
        'updated_at': now,
    }
    if next_status == 'completed':
        updates['completed_at'] = now
    if next_status == 'cancelled':
        updates['cancelled_at'] = now

    mongo.db.projects.update_one({'_id': oid}, {'$set': updates})
    _append_status_history(oid, next_status, ObjectId(identity['id']), note or f'Status updated to {next_status}')

    accepted_freelancer = project.get('accepted_freelancer')
    if accepted_freelancer and next_status in {'completed', 'cancelled'}:
        create_notification(
            user_id=accepted_freelancer,
            notif_type='project_status_changed',
            title='Project status updated',
            body=f"{project.get('title', 'Your project')} is now {next_status}.",
            actor_id=project['client_id'],
            entity_id=oid,
            entity_type='project',
            meta={'project_id': str(oid), 'status': next_status},
        )
        if next_status == 'completed':
            _append_project_to_freelancer_portfolio(project)

    refreshed = mongo.db.projects.find_one({'_id': oid})
    return jsonify(_project_to_dict(refreshed))


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/projects/my   — projets du client connecté
# ══════════════════════════════════════════════════════════════════════════
@projects_bp.route('/<project_id>/contract', methods=['GET'])
@token_required
def get_project_contract(project_id: str):
    identity = _get_identity()
    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404
    if not _can_access_contract(project, identity):
        return jsonify({'error': 'Non autorise'}), 403

    return jsonify({'contract': _project_to_dict(project).get('contract', {})})


@projects_bp.route('/<project_id>/contract', methods=['PUT'])
@token_required
@client_only
def upsert_project_contract(project_id: str):
    identity = _get_identity()
    data = request.get_json() or {}
    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404
    if str(project.get('client_id')) != identity['id']:
        return jsonify({'error': 'Non autorise'}), 403
    if not project.get('accepted_freelancer'):
        return jsonify({'error': 'Aucun freelancer retenu pour ce projet'}), 400

    contract = _normalize_contract_payload(data, project)
    mongo.db.projects.update_one(
        {'_id': oid},
        {'$set': {'contract': contract, 'updated_at': datetime.now(timezone.utc)}},
    )
    _append_status_history(oid, project.get('status', 'in-progress'), ObjectId(identity['id']), 'Mission agreement updated')

    create_notification(
        user_id=project['accepted_freelancer'],
        notif_type='contract_updated',
        title='Mission agreement ready',
        body=f"A mission agreement is ready for {project.get('title', 'your project')}.",
        actor_id=project['client_id'],
        entity_id=oid,
        entity_type='project',
        meta={'project_id': str(oid), 'contract_status': contract['status']},
    )

    refreshed = mongo.db.projects.find_one({'_id': oid})
    return jsonify(_project_to_dict(refreshed))


@projects_bp.route('/<project_id>/contract/sign', methods=['PUT'])
@token_required
@freelancer_only
def sign_project_contract(project_id: str):
    identity = _get_identity()
    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404
    if not _can_access_contract(project, identity):
        return jsonify({'error': 'Non autorise'}), 403

    contract = dict(project.get('contract') or {})
    if not contract:
        return jsonify({'error': 'Aucun accord de mission disponible'}), 404

    contract['freelancer_signed_at'] = datetime.now(timezone.utc)
    contract['status'] = 'signed' if contract.get('client_signed_at') else 'pending-signature'

    mongo.db.projects.update_one(
        {'_id': oid},
        {'$set': {'contract': contract, 'updated_at': datetime.now(timezone.utc)}},
    )
    _append_status_history(oid, project.get('status', 'in-progress'), ObjectId(identity['id']), 'Mission agreement signed')

    create_notification(
        user_id=project['client_id'],
        notif_type='contract_signed',
        title='Mission agreement signed',
        body=f"The freelancer signed the agreement for {project.get('title', 'your project')}.",
        actor_id=ObjectId(identity['id']),
        entity_id=oid,
        entity_type='project',
        meta={'project_id': str(oid), 'contract_status': contract['status']},
    )

    refreshed = mongo.db.projects.find_one({'_id': oid})
    return jsonify(_project_to_dict(refreshed))


@projects_bp.route('/<project_id>/progress', methods=['POST'])
@token_required
def add_project_progress(project_id: str):
    identity = _get_identity()
    data = request.get_json() or {}

    try:
        oid = ObjectId(project_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    project = mongo.db.projects.find_one({'_id': oid})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404
    if project.get('status') != 'in-progress':
        return jsonify({'error': 'Le suivi est disponible uniquement pour les projets en cours'}), 400
    if not _can_access_tracking(project, identity):
        return jsonify({'error': 'Non autorise'}), 403

    entry = _progress_entry(data, identity)
    if not entry['summary'] and not entry['achievements'] and not entry['hours_spent']:
        return jsonify({'error': 'Ajoutez un resume, des taches realisees ou des heures'}), 400

    entries = list(project.get('progress_entries') or [])
    entries.append(entry)
    summary = _progress_summary(entries)
    health = str(data.get('health') or project.get('progress_health') or 'on-track').strip().lower()
    if health not in {'on-track', 'at-risk', 'blocked'}:
        health = 'on-track'

    mongo.db.projects.update_one(
        {'_id': oid},
        {
            '$push': {'progress_entries': entry},
            '$set': {
                **summary,
                'progress_health': health,
                'updated_at': datetime.now(timezone.utc),
            },
        },
    )

    if identity.get('role') == 'freelancer':
        create_notification(
            user_id=project['client_id'],
            notif_type='project_progress_logged',
            title='Project progress updated',
            body=f"{entry.get('actor_name', 'Your freelancer')} logged {entry.get('hours_spent', 0)}h on {project.get('title', 'your project')}.",
            actor_id=ObjectId(identity['id']),
            entity_id=oid,
            entity_type='project',
            meta={
                'project_id': str(oid),
                'work_date': entry.get('work_date'),
                'completion_percent': entry.get('completion_percent', 0),
            },
        )

    refreshed = mongo.db.projects.find_one({'_id': oid})
    return jsonify(_project_to_dict(refreshed)), 201


@projects_bp.route('/tracking', methods=['GET'])
@token_required
def list_project_tracking():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    query = {'status': 'in-progress'}

    if identity.get('role') == 'client':
        query['client_id'] = uid
    else:
        freelancer_doc = mongo.db.freelancers.find_one({'user_id': uid}, {'_id': 1})
        targets = [uid]
        if freelancer_doc:
            targets.append(freelancer_doc['_id'])
        query['accepted_freelancer'] = {'$in': targets}

    projects = list(mongo.db.projects.find(query).sort('updated_at', -1))
    return jsonify({'projects': [_project_to_dict(project) for project in projects], 'total': len(projects)})


@projects_bp.route('/freelancer', methods=['GET'])
@token_required
@freelancer_only
def list_freelancer_projects():
    identity = _get_identity()
    status = request.args.get('status')
    uid = ObjectId(identity['id'])
    freelancer_doc = mongo.db.freelancers.find_one({'user_id': uid}, {'_id': 1})
    targets = [uid]
    if freelancer_doc:
        targets.append(freelancer_doc['_id'])

    query = {'accepted_freelancer': {'$in': targets}, 'status': {'$ne': 'deleted'}}
    if status:
        query['status'] = status

    projects = list(mongo.db.projects.find(query).sort('updated_at', -1))
    return jsonify({'projects': [_project_to_dict(project) for project in projects], 'total': len(projects)})


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
