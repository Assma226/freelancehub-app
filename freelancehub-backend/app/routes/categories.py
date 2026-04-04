# app/routes/categories.py
# ══════════════════════════════════════════════════════════════════════════
#  Categories API
#
#  GET    /api/categories              → liste complète (avec compteurs)
#  GET    /api/categories/<slug>       → détail + projets associés
#  POST   /api/categories              → créer (admin seulement — futur)
#  PUT    /api/categories/<id>         → modifier
#  DELETE /api/categories/<id>         → supprimer
# ══════════════════════════════════════════════════════════════════════════

from flask               import Blueprint, request, jsonify
from app                 import mongo
from app.middleware.auth import token_required
from bson                import ObjectId
from datetime            import datetime, timezone

categories_bp = Blueprint('categories', __name__)


# ── Helpers ───────────────────────────────────────────────────────────────

def _cat_to_dict(c: dict) -> dict:
    c['id'] = str(c.pop('_id'))
    label = c.get('name') or c.get('label', '')
    c['name'] = label
    return c


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/categories   — liste complète avec compteurs live
# ══════════════════════════════════════════════════════════════════════════
@categories_bp.route('', methods=['GET'])
def list_categories():
    include_counts = request.args.get('counts', 'true').lower() == 'true'

    cats = list(mongo.db.categories.find({
        '$or': [{'is_active': True}, {'is_active': {'$exists': False}}],
    }).sort([('order', 1), ('slug', 1)]))

    for c in cats:
        oid = c['_id']
        c['id'] = str(c.pop('_id'))
        label = c.get('name') or c.get('label', '')
        c['name'] = label

        if include_counts:
            slug = c.get('slug', '')
            # Nombre de projets ouverts dans cette catégorie
            c['projects_count'] = mongo.db.projects.count_documents({
                '$or': [
                    {'category_id': oid, 'status': 'open'},
                    {'category': slug, 'status': 'open'},
                    {'category_slug': slug, 'status': 'open'},
                ],
            })
            # Freelancers avec la même catégorie (slug)
            c['freelancers_count'] = mongo.db.freelancers.count_documents({
                'category': slug,
            })

    return jsonify({'categories': cats, 'total': len(cats)})


# ══════════════════════════════════════════════════════════════════════════
#  GET /api/categories/<slug>   — détail + projets + top freelancers
# ══════════════════════════════════════════════════════════════════════════
@categories_bp.route('/<slug>', methods=['GET'])
def get_category(slug: str):

    # Chercher par slug ou par id
    if len(slug) == 24:
        try:
            query = {'_id': ObjectId(slug)}
        except Exception:
            query = {'slug': slug}
    else:
        query = {'slug': slug}

    cat = mongo.db.categories.find_one(query)
    if not cat:
        return jsonify({'error': 'Catégorie introuvable'}), 404

    cat_dict = _cat_to_dict(cat)
    cat_id   = ObjectId(cat_dict['id'])

    # ── Projets ouverts dans cette catégorie ─────────────────────────────
    page      = max(1, int(request.args.get('page', 1)))
    page_size = min(20, int(request.args.get('page_size', 10)))
    skip      = (page - 1) * page_size

    cslug = cat_dict.get('slug', '')
    projects_query = {
        'status': 'open',
        '$or': [
            {'category_id': cat_id},
            {'category': cslug},
            {'category_slug': cslug},
        ],
    }
    projects_total = mongo.db.projects.count_documents(projects_query)
    projects = list(
        mongo.db.projects.find(projects_query)
                         .sort('created_at', -1)
                         .skip(skip)
                         .limit(page_size)
    )
    for p in projects:
        p['id']        = str(p.pop('_id'))
        p['client_id'] = str(p.get('client_id', ''))

    # ── Top freelancers (skills correspondants) ───────────────────────────
    fl_query = {
        'category':     cat_dict.get('slug', ''),
        'is_available': True,
    }
    top_freelancers = list(
        mongo.db.freelancers.find(fl_query)
                            .sort('rating', -1)
                            .limit(8)
    )
    for f in top_freelancers:
        f['id']      = str(f.pop('_id'))
        f['user_id'] = str(f['user_id'])
        user = mongo.db.users.find_one(
            {'_id': ObjectId(f['user_id'])},
            {'name': 1, 'avatar': 1}
        )
        if user:
            f['name']   = user.get('name', '')
            f['avatar'] = user.get('avatar', '')

    # ── Stats ─────────────────────────────────────────────────────────────
    cat_dict['stats'] = {
        'projects_open':    projects_total,
        'freelancers_count':mongo.db.freelancers.count_documents(fl_query),
        'avg_budget':       _avg_budget(cat_id, cslug),
    }

    cat_dict['projects']        = projects
    cat_dict['projects_total']  = projects_total
    cat_dict['top_freelancers'] = top_freelancers

    return jsonify(cat_dict)


def _avg_budget(cat_id: ObjectId, slug: str = '') -> float:
    """Calculate average midpoint budget for open projects in a category."""
    match = {
        'status': 'open',
        '$or': [{'category_id': cat_id}],
    }
    if slug:
        match['$or'].append({'category': slug})
        match['$or'].append({'category_slug': slug})
    pipeline = [
        {'$match': match},
        {'$project':{'mid': {'$avg': ['$budget_min', '$budget_max']}}},
        {'$group':  {'_id': None, 'avg': {'$avg': '$mid'}}},
    ]
    result = list(mongo.db.projects.aggregate(pipeline))
    return round(result[0]['avg'], 2) if result else 0.0


# ══════════════════════════════════════════════════════════════════════════
#  POST /api/categories   — créer une catégorie
# ══════════════════════════════════════════════════════════════════════════
@categories_bp.route('', methods=['POST'])
@token_required
def create_category():
    # TODO: Ajouter une vérification admin
    data = request.get_json()

    required = ['name', 'slug', 'icon']
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Champs manquants : {", ".join(missing)}'}), 400

    if mongo.db.categories.find_one({'slug': data['slug']}):
        return jsonify({'error': 'Un slug identique existe déjà'}), 409

    now      = datetime.now(timezone.utc)
    last_cat = mongo.db.categories.find_one(sort=[('order', -1)])
    order    = (last_cat['order'] + 1) if last_cat else 1

    cat = {
        'name':        data['name'].strip(),
        'slug':        data['slug'].strip().lower(),
        'icon':        data['icon'].strip(),
        'description': data.get('description', ''),
        'bg_gradient': data.get('bg_gradient', 'linear-gradient(135deg,#8B1A3A,#C0395A)'),
        'is_active':   True,
        'order':       order,
        'created_at':  now,
        'updated_at':  now,
    }

    result = mongo.db.categories.insert_one(cat)
    return jsonify({'message': 'Catégorie créée', 'id': str(result.inserted_id)}), 201


# ══════════════════════════════════════════════════════════════════════════
#  PUT /api/categories/<id>
# ══════════════════════════════════════════════════════════════════════════
@categories_bp.route('/<cat_id>', methods=['PUT'])
@token_required
def update_category(cat_id: str):
    try:
        oid = ObjectId(cat_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    cat = mongo.db.categories.find_one({'_id': oid})
    if not cat:
        return jsonify({'error': 'Catégorie introuvable'}), 404

    data    = request.get_json()
    allowed = ['name', 'icon', 'description', 'bg_gradient', 'is_active', 'order']
    updates = {k: data[k] for k in allowed if k in data}
    updates['updated_at'] = datetime.now(timezone.utc)

    mongo.db.categories.update_one({'_id': oid}, {'$set': updates})
    return jsonify({'message': 'Catégorie mise à jour'})


# ══════════════════════════════════════════════════════════════════════════
#  DELETE /api/categories/<id>   — soft delete (désactiver)
# ══════════════════════════════════════════════════════════════════════════
@categories_bp.route('/<cat_id>', methods=['DELETE'])
@token_required
def delete_category(cat_id: str):
    try:
        oid = ObjectId(cat_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    cat = mongo.db.categories.find_one({'_id': oid})
    if not cat:
        return jsonify({'error': 'Catégorie introuvable'}), 404

    # Vérifier qu'il n'y a pas de projets actifs
    active_projects = mongo.db.projects.count_documents({
        'category_id': oid,
        'status':      {'$in': ['open', 'in-progress']}
    })
    if active_projects > 0:
        return jsonify({
            'error':   'Impossible de supprimer : des projets actifs utilisent cette catégorie',
            'count':   active_projects,
        }), 400

    mongo.db.categories.update_one(
        {'_id': oid},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc)}}
    )
    return jsonify({'message': 'Catégorie désactivée'})