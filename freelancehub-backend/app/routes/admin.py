from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, jsonify, request

from app import mongo
from app.middleware.auth import admin_only, token_required


admin_bp = Blueprint('admin', __name__)


def _serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if hasattr(value, 'isoformat') and callable(getattr(value, 'isoformat', None)):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    return value


def _public_user(user):
    return {
        'id': str(user.get('_id')),
        'name': user.get('name', ''),
        'email': user.get('email', ''),
        'role': user.get('role', ''),
        'avatar': user.get('avatar', ''),
        'is_active': user.get('is_active', True),
        'created_at': _serialize_value(user.get('created_at')),
        'trial_used': user.get('trial_used', False),
    }


def _transaction_amount(tx):
    for key in ('platform_revenue', 'amount', 'gross_amount', 'client_pays'):
        try:
            amount = float(tx.get(key, 0) or 0)
        except (TypeError, ValueError):
            amount = 0
        if amount:
            return amount
    return 0


@admin_bp.route('/overview', methods=['GET'])
@token_required
@admin_only
def overview():
    users_total = mongo.db.users.count_documents({})
    freelancers = mongo.db.users.count_documents({'role': 'freelancer'})
    clients = mongo.db.users.count_documents({'role': 'client'})
    active_users = mongo.db.users.count_documents({'is_active': {'$ne': False}})
    projects = mongo.db.projects.count_documents({'status': {'$ne': 'deleted'}})
    open_projects = mongo.db.projects.count_documents({'status': 'open'})
    applications = mongo.db.applications.count_documents({})
    pending_applications = mongo.db.applications.count_documents({'status': 'pending'})
    escrows_held = mongo.db.transactions.count_documents({'type': 'project_payment', 'status': 'held'})
    completed_project_ids = [
        project['_id']
        for project in mongo.db.projects.find({'status': 'completed'}, {'_id': 1})
    ]
    escrows_pending_release = mongo.db.transactions.count_documents({
        'type': 'project_payment',
        'status': {'$in': ['held', 'disputed']},
        'project_id': {'$in': completed_project_ids},
    }) if completed_project_ids else 0

    txs = list(mongo.db.transactions.find({}))
    platform_revenue = round(sum(float(tx.get('platform_revenue', 0) or 0) for tx in txs), 2)
    volume = round(sum(_transaction_amount(tx) for tx in txs), 2)

    latest_users = list(mongo.db.users.find({}).sort('created_at', -1).limit(5))
    latest_projects = list(mongo.db.projects.find({'status': {'$ne': 'deleted'}}).sort('created_at', -1).limit(5))

    return jsonify({
        'stats': {
            'users_total': users_total,
            'active_users': active_users,
            'freelancers': freelancers,
            'clients': clients,
            'projects': projects,
            'open_projects': open_projects,
            'applications': applications,
            'pending_applications': pending_applications,
            'escrows_held': escrows_held,
            'escrows_pending_release': escrows_pending_release,
            'platform_revenue': platform_revenue,
            'volume': volume,
        },
        'latest_users': [_public_user(user) for user in latest_users],
        'latest_projects': [_serialize_value(project) for project in latest_projects],
    })


@admin_bp.route('/users', methods=['GET'])
@token_required
@admin_only
def list_users():
    query = {}
    search = (request.args.get('q') or '').strip()
    role = (request.args.get('role') or '').strip()
    status = (request.args.get('status') or '').strip()
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'email': {'$regex': search, '$options': 'i'}},
        ]
    if role in {'client', 'freelancer', 'admin'}:
        query['role'] = role
    if status == 'active':
        query['is_active'] = {'$ne': False}
    elif status == 'blocked':
        query['is_active'] = False

    page = max(1, int(request.args.get('page', 1)))
    page_size = min(100, int(request.args.get('page_size', 30)))
    total = mongo.db.users.count_documents(query)
    users = list(mongo.db.users.find(query).sort('created_at', -1).skip((page - 1) * page_size).limit(page_size))

    result = []
    for user in users:
        item = _public_user(user)
        if user.get('role') == 'freelancer':
            item['applications_count'] = mongo.db.applications.count_documents({'freelancer_id': user['_id']})
            item['profile_exists'] = bool(mongo.db.freelancers.find_one({'user_id': user['_id']}, {'_id': 1}))
        elif user.get('role') == 'client':
            item['projects_count'] = mongo.db.projects.count_documents({'client_id': user['_id']})
        result.append(item)

    return jsonify({'users': result, 'total': total, 'page': page, 'page_size': page_size})


@admin_bp.route('/users/<user_id>/status', methods=['PUT'])
@token_required
@admin_only
def update_user_status(user_id):
    data = request.get_json() or {}
    action = (data.get('action') or '').strip().lower()
    if action not in {'activate', 'block'}:
        return jsonify({'error': 'action doit etre activate ou block'}), 400
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    user = mongo.db.users.find_one({'_id': oid})
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404
    if user.get('role') == 'admin' and action == 'block':
        return jsonify({'error': 'Impossible de bloquer un administrateur'}), 400

    mongo.db.users.update_one(
        {'_id': oid},
        {'$set': {'is_active': action == 'activate', 'updated_at': datetime.now(timezone.utc)}},
    )
    refreshed = mongo.db.users.find_one({'_id': oid})
    return jsonify({'message': 'Statut mis a jour', 'user': _public_user(refreshed)})


@admin_bp.route('/projects', methods=['GET'])
@token_required
@admin_only
def list_projects():
    query = {'status': {'$ne': 'deleted'}}
    status = (request.args.get('status') or '').strip()
    search = (request.args.get('q') or '').strip()
    if status:
        query['status'] = status
    if search:
        query['$or'] = [
            {'title': {'$regex': search, '$options': 'i'}},
            {'description': {'$regex': search, '$options': 'i'}},
        ]

    page = max(1, int(request.args.get('page', 1)))
    page_size = min(100, int(request.args.get('page_size', 30)))
    total = mongo.db.projects.count_documents(query)
    projects = list(mongo.db.projects.find(query).sort('created_at', -1).skip((page - 1) * page_size).limit(page_size))
    return jsonify({'projects': [_serialize_value(project) for project in projects], 'total': total})


@admin_bp.route('/transactions', methods=['GET'])
@token_required
@admin_only
def list_transactions():
    txs = list(mongo.db.transactions.find({}).sort('created_at', -1).limit(100))
    return jsonify({
        'transactions': [_serialize_value(tx) for tx in txs],
        'total': mongo.db.transactions.count_documents({}),
    })


@admin_bp.route('/escrows/pending-release', methods=['GET'])
@token_required
@admin_only
def list_escrows_pending_release():
    completed_project_ids = [
        project['_id']
        for project in mongo.db.projects.find({'status': 'completed'}, {'_id': 1})
    ]
    query = {
        'type': 'project_payment',
        'status': {'$in': ['held', 'disputed']},
        'project_id': {'$in': completed_project_ids},
    }
    txs = list(mongo.db.transactions.find(query).sort('updated_at', -1).limit(100))
    project_map = {
        project['_id']: project
        for project in mongo.db.projects.find({'_id': {'$in': [tx.get('project_id') for tx in txs if tx.get('project_id')]}})
    }
    items = []
    for tx in txs:
        item = _serialize_value(tx)
        project = project_map.get(tx.get('project_id'))
        if project:
            item['project'] = {
                'id': str(project['_id']),
                'title': project.get('title', ''),
                'completed_at': _serialize_value(project.get('completed_at')),
                'escrow_status': project.get('escrow_status', ''),
            }
        items.append(item)
    return jsonify({'escrows': items, 'total': len(items)})


@admin_bp.route('/payouts', methods=['GET'])
@token_required
@admin_only
def list_payouts():
    payouts = list(mongo.db.payout_requests.find({}).sort('created_at', -1).limit(100))
    return jsonify({'payouts': [_serialize_value(payout) for payout in payouts], 'total': len(payouts)})


@admin_bp.route('/payouts/<payout_id>/status', methods=['PUT'])
@token_required
@admin_only
def update_payout_status(payout_id):
    data = request.get_json() or {}
    status = (data.get('status') or '').strip().lower()
    if status not in {'approved', 'paid', 'rejected'}:
        return jsonify({'error': 'Statut payout invalide'}), 400
    try:
        oid = ObjectId(payout_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    updates = {
        'status': status,
        'review_note': data.get('note', ''),
        'updated_at': datetime.now(timezone.utc),
    }
    if status == 'paid':
        updates['paid_at'] = datetime.now(timezone.utc)
    result = mongo.db.payout_requests.update_one({'_id': oid}, {'$set': updates})
    if result.matched_count == 0:
        return jsonify({'error': 'Demande introuvable'}), 404
    payout = mongo.db.payout_requests.find_one({'_id': oid})
    return jsonify({'message': 'Payout mis a jour', 'payout': _serialize_value(payout)})
