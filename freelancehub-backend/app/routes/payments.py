# app/routes/payments.py
# ══════════════════════════════════════════════════════════
# Routes de paiement et commission
#
# Modèle :
#   ✅ 1er projet → 0% commission (essai gratuit)
#   ✅ Projets suivants → 5% client + 5% freelancer
#   ✅ Abonnement Basic $19/mois
# ══════════════════════════════════════════════════════════

from flask import Blueprint, request, jsonify, Response
from app import mongo
from app.middleware.auth import token_required, client_only, freelancer_only, admin_only, _get_identity
from app.utils.notifications import create_notification, notify_admins
from bson import ObjectId
from datetime import datetime, timezone

payments_bp = Blueprint('payments', __name__)

COMMISSION_RATE = 0.05  # 5%


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


def _money(value):
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0


def _tx_amount(tx, *keys):
    return sum(_money(tx.get(key)) for key in keys)


def _now():
    return datetime.now(timezone.utc)


def _object_id(value, label='ID'):
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError(f'{label} invalide')


def _actor_can_view_tx(tx, identity):
    uid = ObjectId(identity['id'])
    role = identity.get('role')
    return (
        role == 'admin'
        or tx.get('client_id') == uid
        or tx.get('freelancer_id') == uid
        or tx.get('user_id') == uid
    )


def _credit_freelancer_once(tx):
    if tx.get('freelancer_credited_at') or not tx.get('freelancer_id'):
        return
    freelancer_commission = _money(tx.get('freelancer_commission'))
    mongo.db.freelancers.update_one(
        {'user_id': tx['freelancer_id']},
        {'$inc': {
            'earnings_total': _money(tx.get('gross_amount')),
            'earnings_after_fees': _money(tx.get('freelancer_receives')),
            'platform_fees_paid': freelancer_commission,
            'completed_jobs': 1,
        }}
    )
    mongo.db.transactions.update_one(
        {'_id': tx['_id']},
        {'$set': {'freelancer_credited_at': _now()}}
    )


def _notify_project_participants(tx, notif_type, title, body, actor_id=None, meta=None):
    base_meta = {
        'project_id': str(tx.get('project_id', '')),
        'transaction_id': str(tx.get('_id', '')),
        **(meta or {}),
    }
    if tx.get('client_id'):
        create_notification(
            user_id=tx['client_id'],
            notif_type=notif_type,
            title=title,
            body=body,
            actor_id=actor_id,
            entity_id=tx.get('project_id'),
            entity_type='project',
            meta=base_meta,
        )
    if tx.get('freelancer_id'):
        create_notification(
            user_id=tx['freelancer_id'],
            notif_type=notif_type,
            title=title,
            body=body,
            actor_id=actor_id,
            entity_id=tx.get('project_id'),
            entity_type='project',
            meta=base_meta,
        )


def _visible_transactions_query(identity):
    uid = ObjectId(identity['id'])
    role = identity.get('role')
    if role == 'admin':
        return {}
    if role == 'client':
        return {'client_id': uid}
    if role == 'freelancer':
        return {'freelancer_id': uid}
    return {'user_id': uid}


def _build_tx_filters(identity):
    query = _visible_transactions_query(identity)
    tx_type = (request.args.get('type') or '').strip()
    status = (request.args.get('status') or '').strip()
    date_from = (request.args.get('date_from') or '').strip()
    date_to = (request.args.get('date_to') or '').strip()
    search = (request.args.get('q') or '').strip()

    if tx_type:
        query['type'] = tx_type
    if status:
        query['status'] = status
    if date_from or date_to:
        created = {}
        if date_from:
            created['$gte'] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        if date_to:
            created['$lte'] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        query['created_at'] = created
    if search:
        query['$or'] = [
            {'invoice_number': {'$regex': search, '$options': 'i'}},
            {'type': {'$regex': search, '$options': 'i'}},
            {'status': {'$regex': search, '$options': 'i'}},
        ]
    return query


def _pdf_escape(text):
    return str(text).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _simple_pdf(lines):
    y = 780
    content = ['BT', '/F1 18 Tf', '1 0 0 1 50 810 Tm', '(FreelanceHub - Facture) Tj', '/F1 10 Tf']
    for line in lines:
        content.append(f'1 0 0 1 50 {y} Tm ({_pdf_escape(line)}) Tj')
        y -= 18
    content.append('ET')
    stream = '\n'.join(content).encode('latin-1', errors='replace')
    objects = [
        b'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        b'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        b'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
        b'4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
        b'5 0 obj << /Length ' + str(len(stream)).encode() + b' >> stream\n' + stream + b'\nendstream endobj',
    ]
    pdf = bytearray(b'%PDF-1.4\n')
    offsets = []
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj + b'\n')
    xref = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
    for offset in offsets:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode())
    pdf.extend(f'trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode())
    return bytes(pdf)


# ─────────────────────────────────────────────────────────
# Calculer la commission d'un projet
# GET /api/payments/commission?budget=2000&user_id=xxx
# ─────────────────────────────────────────────────────────
@payments_bp.route('/commission', methods=['GET'])
@token_required
def get_commission():
    identity   = _get_identity()
    budget     = float(request.args.get('budget', 0))
    user       = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    is_trial = not user.get('trial_used', False)

    if is_trial:
        return jsonify({
            'is_trial':              True,
            'commission_rate':       0,
            'client_commission':     0,
            'freelancer_commission': 0,
            'client_pays':           budget,
            'freelancer_receives':   budget,
            'platform_revenue':      0,
            'message':               '🎁 Essai gratuit — 0% commission !'
        })


    client_comm     = round(budget * COMMISSION_RATE, 2)
    freelancer_comm = round(budget * COMMISSION_RATE, 2)
    return jsonify({
        'is_trial':              False,
        'commission_rate':       COMMISSION_RATE * 100,
        'client_commission':     client_comm,
        'freelancer_commission': freelancer_comm,
        'client_pays':           round(budget + client_comm, 2),
        'freelancer_receives':   round(budget - freelancer_comm, 2),
        'platform_revenue':      round(client_comm + freelancer_comm, 2),
    })


@payments_bp.route('/summary', methods=['GET'])
@token_required
def payment_summary():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    role = identity.get('role')

    if role == 'admin':
        txs = list(mongo.db.transactions.find({}).sort('created_at', -1).limit(80))
        payouts = list(mongo.db.payout_requests.find({}).sort('created_at', -1).limit(20))
        disputes = list(mongo.db.disputes.find({}).sort('created_at', -1).limit(20))
        return jsonify({
            'role': role,
            'stats': {
                'volume': round(sum(_tx_amount(tx, 'client_pays', 'amount', 'gross_amount') for tx in txs), 2),
                'platform_revenue': round(sum(_money(tx.get('platform_revenue')) for tx in txs), 2),
                'escrow_held': round(sum(_money(tx.get('client_pays')) for tx in txs if tx.get('status') == 'held'), 2),
                'transactions': mongo.db.transactions.count_documents({}),
                'pending_payouts': mongo.db.payout_requests.count_documents({'status': 'pending'}),
                'open_disputes': mongo.db.disputes.count_documents({'status': 'open'}),
            },
            'transactions': [_serialize_value(tx) for tx in txs],
            'payouts': [_serialize_value(payout) for payout in payouts],
            'disputes': [_serialize_value(dispute) for dispute in disputes],
        })

    if role == 'client':
        query = {'client_id': uid}
        txs = list(mongo.db.transactions.find(query).sort('created_at', -1).limit(50))
        return jsonify({
            'role': role,
            'stats': {
                'paid_total': round(sum(_money(tx.get('client_pays')) for tx in txs), 2),
                'commission_paid': round(sum(_money(tx.get('client_commission')) for tx in txs), 2),
                'projects_paid': len([tx for tx in txs if tx.get('type') == 'project_payment']),
                'escrow_held': round(sum(_money(tx.get('client_pays')) for tx in txs if tx.get('status') == 'held'), 2),
                'refunded_total': round(sum(_money(tx.get('refund_amount')) for tx in txs if tx.get('status') == 'refunded'), 2),
                'subscriptions': mongo.db.subscriptions.count_documents({'user_id': uid}),
            },
            'transactions': [_serialize_value(tx) for tx in txs],
            'disputes': [_serialize_value(dispute) for dispute in mongo.db.disputes.find({'client_id': uid}).sort('created_at', -1).limit(20)],
        })

    query = {'freelancer_id': uid}
    txs = list(mongo.db.transactions.find(query).sort('created_at', -1).limit(50))
    payouts = list(mongo.db.payout_requests.find({'freelancer_id': uid}).sort('created_at', -1).limit(20))
    released_txs = [tx for tx in txs if tx.get('status') == 'completed']
    earned = round(sum(_money(tx.get('freelancer_receives')) for tx in released_txs), 2)
    paid_out = round(sum(_money(payout.get('amount')) for payout in payouts if payout.get('status') == 'paid'), 2)
    pending = round(sum(_money(payout.get('amount')) for payout in payouts if payout.get('status') in {'pending', 'approved'}), 2)
    return jsonify({
        'role': role,
        'stats': {
            'earned_total': earned,
            'available_balance': max(round(earned - paid_out - pending, 2), 0),
            'fees_paid': round(sum(_money(tx.get('freelancer_commission')) for tx in released_txs), 2),
            'escrow_pending': round(sum(_money(tx.get('freelancer_receives')) for tx in txs if tx.get('status') == 'held'), 2),
            'pending_payouts': pending,
        },
        'transactions': [_serialize_value(tx) for tx in txs],
        'payouts': [_serialize_value(payout) for payout in payouts],
        'disputes': [_serialize_value(dispute) for dispute in mongo.db.disputes.find({'freelancer_id': uid}).sort('created_at', -1).limit(20)],
    })


@payments_bp.route('/wallet', methods=['GET'])
@token_required
@freelancer_only
def freelancer_wallet():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    txs = list(mongo.db.transactions.find({'freelancer_id': uid}).sort('created_at', -1).limit(100))
    payouts = list(mongo.db.payout_requests.find({'freelancer_id': uid}).sort('created_at', -1).limit(50))
    released_txs = [tx for tx in txs if tx.get('status') == 'completed']
    earned = round(sum(_money(tx.get('freelancer_receives')) for tx in released_txs), 2)
    paid_out = round(sum(_money(payout.get('amount')) for payout in payouts if payout.get('status') == 'paid'), 2)
    pending_payouts = round(sum(_money(payout.get('amount')) for payout in payouts if payout.get('status') in {'pending', 'approved'}), 2)
    return jsonify({
        'currency': 'USD',
        'balance': {
            'available': max(round(earned - paid_out - pending_payouts, 2), 0),
            'earned_total': earned,
            'escrow_pending': round(sum(_money(tx.get('freelancer_receives')) for tx in txs if tx.get('status') in {'held', 'disputed'}), 2),
            'paid_out': paid_out,
            'pending_payouts': pending_payouts,
            'fees_paid': round(sum(_money(tx.get('freelancer_commission')) for tx in released_txs), 2),
        },
        'transactions': [_serialize_value(tx) for tx in txs],
        'payouts': [_serialize_value(payout) for payout in payouts],
    })


@payments_bp.route('/payouts/request', methods=['POST'])
@token_required
@freelancer_only
def request_payout():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    data = request.get_json() or {}
    amount = _money(data.get('amount'))
    method = (data.get('method') or 'bank').strip().lower()
    destination = (data.get('destination') or '').strip()

    if amount <= 0:
        return jsonify({'error': 'Montant invalide'}), 400
    if method not in {'bank', 'paypal', 'payoneer', 'mobile_money'}:
        return jsonify({'error': 'Methode de retrait invalide'}), 400
    if not destination:
        return jsonify({'error': 'Destination de paiement requise'}), 400

    txs = list(mongo.db.transactions.find({'freelancer_id': uid, 'status': 'completed'}))
    payouts = list(mongo.db.payout_requests.find({'freelancer_id': uid}))
    earned = round(sum(_money(tx.get('freelancer_receives')) for tx in txs), 2)
    committed = round(sum(_money(payout.get('amount')) for payout in payouts if payout.get('status') in {'pending', 'approved', 'paid'}), 2)
    available = max(round(earned - committed, 2), 0)
    if amount > available:
        return jsonify({'error': f'Solde disponible insuffisant (${available})'}), 400

    now = datetime.now(timezone.utc)
    result = mongo.db.payout_requests.insert_one({
        'freelancer_id': uid,
        'amount': amount,
        'currency': 'USD',
        'method': method,
        'destination': destination,
        'status': 'pending',
        'created_at': now,
        'updated_at': now,
    })
    return jsonify({'message': 'Demande de retrait creee', 'payout_id': str(result.inserted_id)}), 201


# ─────────────────────────────────────────────────────────
# Finaliser un paiement de projet
# POST /api/payments/project/:project_id/pay
# Body: { freelancer_id, agreed_amount }
# ─────────────────────────────────────────────────────────
@payments_bp.route('/project/<project_id>/pay', methods=['POST'])
@client_only
def pay_project(project_id):
    identity      = _get_identity()
    data          = request.get_json() or {}
    freelancer_id = data.get('freelancer_id')
    payment_method = (data.get('payment_method') or 'card').strip().lower()

    client = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})
    if not client:
        return jsonify({'error': 'Client non trouvé'}), 404

    try:
        project_oid = _object_id(project_id, 'Projet')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    project = mongo.db.projects.find_one({'_id': project_oid, 'client_id': ObjectId(identity['id'])})
    if not project:
        return jsonify({'error': 'Projet introuvable'}), 404

    contract = project.get('contract') or {}
    if contract.get('status') != 'signed':
        return jsonify({'error': 'Le contrat doit etre signe par le client et le freelancer avant le paiement'}), 400

    if not freelancer_id:
        freelancer_id = project.get('accepted_freelancer') or project.get('assigned_freelancer_id')
    try:
        freelancer_oid = _object_id(freelancer_id, 'Freelancer') if freelancer_id else None
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    if not freelancer_oid:
        return jsonify({'error': 'Freelancer requis'}), 400

    accepted_freelancer = project.get('accepted_freelancer') or project.get('assigned_freelancer_id')
    if accepted_freelancer:
        try:
            accepted_oid = _object_id(accepted_freelancer, 'Freelancer retenu')
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        if freelancer_oid != accepted_oid:
            return jsonify({'error': 'Le paiement doit viser le freelancer retenu'}), 400

    agreed_amount = _money(data.get('agreed_amount', contract.get('amount', project.get('agreed_amount', 0))))
    if agreed_amount <= 0:
        return jsonify({'error': 'Montant invalide'}), 400
    if _money(contract.get('amount')) and agreed_amount != _money(contract.get('amount')):
        return jsonify({'error': 'Le montant doit correspondre au contrat signe'}), 400

    existing = mongo.db.transactions.find_one({
        'project_id': project_oid,
        'type': 'project_payment',
        'status': {'$in': ['held', 'completed', 'disputed', 'refunded']},
    })
    if existing:
        return jsonify({'error': 'Un paiement existe deja pour ce projet'}), 409

    # Déterminer si c'est l'essai gratuit
    is_trial = not client.get('trial_used', False)

    if is_trial:
        client_pays           = agreed_amount
        client_commission     = 0
        freelancer_receives   = agreed_amount
        freelancer_commission = 0
        platform_revenue      = 0
    else:
        client_commission     = round(agreed_amount * COMMISSION_RATE, 2)
        freelancer_commission = round(agreed_amount * COMMISSION_RATE, 2)
        client_pays           = round(agreed_amount + client_commission, 2)
        freelancer_receives   = round(agreed_amount - freelancer_commission, 2)
        platform_revenue      = round(client_commission + freelancer_commission, 2)

    now = _now()
    invoice_number = f'FH-{now.strftime("%Y%m%d")}-{str(ObjectId())[-6:].upper()}'

    # Enregistrer la transaction en escrow
    transaction = {
        'type':                   'project_payment',
        'project_id':             project_oid,
        'client_id':              ObjectId(identity['id']),
        'freelancer_id':          freelancer_oid,
        'gross_amount':           agreed_amount,
        'client_pays':            client_pays,
        'client_commission':      client_commission if not is_trial else 0,
        'freelancer_receives':    freelancer_receives,
        'freelancer_commission':  freelancer_commission if not is_trial else 0,
        'platform_revenue':       platform_revenue if not is_trial else 0,
        'currency':               'USD',
        'status':                 'held',
        'escrow_status':          'funded',
        'held_amount':            client_pays,
        'payment_method':         payment_method,
        'invoice_number':         invoice_number,
        'is_trial':               is_trial,
        'created_at':             now,
        'updated_at':             now,
    }
    tx_result = mongo.db.transactions.insert_one(transaction)

    # Mettre à jour le projet
    mongo.db.projects.update_one(
        {'_id': project_oid},
        {'$set': {
            'status':                     'in-progress',
            'assigned_freelancer_id':     freelancer_oid,
            'escrow_transaction_id':       tx_result.inserted_id,
            'escrow_status':              'funded',
            'agreed_amount':              agreed_amount,
            'is_trial_project':           is_trial,
            'commission_rate_client':     0 if is_trial else COMMISSION_RATE * 100,
            'commission_rate_freelancer': 0 if is_trial else COMMISSION_RATE * 100,
            'updated_at':                 now,
        }}
    )

    # Marquer le trial comme utilisé si c'était le 1er projet
    if is_trial:
        mongo.db.users.update_one(
            {'_id': ObjectId(identity['id'])},
            {'$set': {'trial_used': True, 'trial_used_at': now}}
        )

    project_title = project.get('title', 'the project')
    create_notification(
        user_id=freelancer_oid,
        notif_type='escrow_funded',
        title='Escrow funded',
        body=f"The client funded escrow for {project_title}. The money is held until admin release.",
        actor_id=ObjectId(identity['id']),
        entity_id=project_oid,
        entity_type='project',
        meta={
            'project_id': str(project_oid),
            'transaction_id': str(tx_result.inserted_id),
            'escrow_status': 'funded',
            'freelancer_receives': freelancer_receives,
        },
    )
    notify_admins(
        notif_type='escrow_funded',
        title='New funded escrow',
        body=f"Escrow was funded for {project_title}. Release it after the project is marked completed.",
        actor_id=ObjectId(identity['id']),
        entity_id=tx_result.inserted_id,
        entity_type='transaction',
        meta={
            'project_id': str(project_oid),
            'transaction_id': str(tx_result.inserted_id),
            'client_pays': client_pays,
            'freelancer_receives': freelancer_receives,
            'escrow_status': 'funded',
        },
    )

    return jsonify({
        'message':             'Paiement place en escrow',
        'transaction_id':      str(tx_result.inserted_id),
        'invoice_number':      invoice_number,
        'escrow_status':       'funded',
        'is_trial':            is_trial,
        'agreed_amount':       agreed_amount,
        'client_pays':         client_pays,
        'freelancer_receives': freelancer_receives,
        'platform_revenue':    platform_revenue if not is_trial else 0,
    }), 200


# ─────────────────────────────────────────────────────────
# S'abonner à un plan
# POST /api/payments/subscribe
# Body: { plan_slug }
# ─────────────────────────────────────────────────────────
@payments_bp.route('/transactions/<tx_id>/release', methods=['POST'])
@token_required
@admin_only
def release_escrow(tx_id):
    identity = _get_identity()
    try:
        oid = _object_id(tx_id, 'Transaction')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    tx = mongo.db.transactions.find_one({'_id': oid, 'type': 'project_payment'})
    if not tx:
        return jsonify({'error': 'Transaction introuvable'}), 404
    if tx.get('status') not in {'held', 'disputed'}:
        return jsonify({'error': 'Escrow non liberable'}), 400
    project = mongo.db.projects.find_one({'_id': tx.get('project_id')}) if tx.get('project_id') else None
    if not project or project.get('status') != 'completed':
        return jsonify({'error': 'Le projet doit etre marque complete avant liberation'}), 400

    now = _now()
    mongo.db.transactions.update_one(
        {'_id': oid},
        {'$set': {'status': 'completed', 'escrow_status': 'released', 'released_at': now, 'released_by': ObjectId(identity['id']), 'updated_at': now}}
    )
    refreshed = mongo.db.transactions.find_one({'_id': oid})
    _credit_freelancer_once(refreshed)
    mongo.db.projects.update_one({'_id': refreshed.get('project_id')}, {'$set': {'escrow_status': 'released', 'updated_at': now}})
    mongo.db.disputes.update_many({'transaction_id': oid, 'status': 'open'}, {'$set': {'status': 'resolved', 'resolution': 'released', 'resolved_at': now, 'updated_at': now}})
    _notify_project_participants(
        refreshed,
        notif_type='escrow_released',
        title='Escrow released',
        body=f"Escrow for {project.get('title', 'the project')} was released to the freelancer wallet.",
        actor_id=ObjectId(identity['id']),
        meta={
            'escrow_status': 'released',
            'freelancer_receives': refreshed.get('freelancer_receives', 0),
        },
    )
    return jsonify({'message': 'Escrow libere', 'transaction': _serialize_value(mongo.db.transactions.find_one({'_id': oid}))})


@payments_bp.route('/transactions/<tx_id>/refund', methods=['POST'])
@token_required
@admin_only
def refund_escrow(tx_id):
    identity = _get_identity()
    try:
        oid = _object_id(tx_id, 'Transaction')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    data = request.get_json() or {}
    reason = (data.get('reason') or '').strip()
    tx = mongo.db.transactions.find_one({'_id': oid, 'type': 'project_payment'})
    if not tx:
        return jsonify({'error': 'Transaction introuvable'}), 404
    if tx.get('status') not in {'held', 'disputed'}:
        return jsonify({'error': 'Seuls les escrows bloques peuvent etre rembourses'}), 400
    project = mongo.db.projects.find_one({'_id': tx.get('project_id')}) if tx.get('project_id') else None
    now = _now()
    mongo.db.transactions.update_one(
        {'_id': oid},
        {'$set': {'status': 'refunded', 'escrow_status': 'refunded', 'refund_amount': _money(tx.get('client_pays')), 'refund_reason': reason, 'refunded_at': now, 'updated_at': now}}
    )
    mongo.db.projects.update_one({'_id': tx.get('project_id')}, {'$set': {'escrow_status': 'refunded', 'status': 'refunded', 'updated_at': now}})
    mongo.db.disputes.update_many({'transaction_id': oid, 'status': 'open'}, {'$set': {'status': 'resolved', 'resolution': 'refunded', 'resolved_at': now, 'updated_at': now}})
    refreshed = mongo.db.transactions.find_one({'_id': oid})
    project_title = (project or {}).get('title', 'the project')
    reason_text = f" Reason: {reason}" if reason else ''
    _notify_project_participants(
        refreshed,
        notif_type='escrow_refunded',
        title='Escrow refunded',
        body=f"Escrow for {project_title} was refunded to the client by admin.{reason_text}",
        actor_id=ObjectId(identity['id']),
        meta={
            'escrow_status': 'refunded',
            'refund_amount': refreshed.get('refund_amount', 0),
            'reason': reason,
        },
    )
    return jsonify({'message': 'Escrow rembourse', 'transaction': _serialize_value(refreshed)})


@payments_bp.route('/transactions/<tx_id>/disputes', methods=['POST'])
@token_required
def create_dispute(tx_id):
    identity = _get_identity()
    try:
        oid = _object_id(tx_id, 'Transaction')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    tx = mongo.db.transactions.find_one({'_id': oid, 'type': 'project_payment'})
    if not tx:
        return jsonify({'error': 'Transaction introuvable'}), 404
    if not _actor_can_view_tx(tx, identity):
        return jsonify({'error': 'Acces refuse'}), 403
    if tx.get('status') not in {'held', 'disputed'}:
        return jsonify({'error': 'Litige possible uniquement sur un escrow actif'}), 400
    data = request.get_json() or {}
    reason = (data.get('reason') or '').strip()
    if len(reason) < 8:
        return jsonify({'error': 'Motif de litige trop court'}), 400
    existing = mongo.db.disputes.find_one({'transaction_id': oid, 'status': 'open'})
    if existing:
        return jsonify({'error': 'Un litige ouvert existe deja'}), 409
    now = _now()
    result = mongo.db.disputes.insert_one({
        'transaction_id': oid,
        'project_id': tx.get('project_id'),
        'client_id': tx.get('client_id'),
        'freelancer_id': tx.get('freelancer_id'),
        'opened_by': ObjectId(identity['id']),
        'opened_by_role': identity.get('role'),
        'reason': reason,
        'status': 'open',
        'created_at': now,
        'updated_at': now,
    })
    mongo.db.transactions.update_one({'_id': oid}, {'$set': {'status': 'disputed', 'escrow_status': 'disputed', 'updated_at': now}})
    mongo.db.projects.update_one({'_id': tx.get('project_id')}, {'$set': {'escrow_status': 'disputed', 'updated_at': now}})
    return jsonify({'message': 'Litige ouvert', 'dispute_id': str(result.inserted_id)}), 201


@payments_bp.route('/disputes', methods=['GET'])
@token_required
def list_disputes():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    role = identity.get('role')
    query = {}
    if role == 'client':
        query['client_id'] = uid
    elif role == 'freelancer':
        query['freelancer_id'] = uid
    status = (request.args.get('status') or '').strip()
    if status:
        query['status'] = status
    disputes = list(mongo.db.disputes.find(query).sort('created_at', -1).limit(100))
    return jsonify({'disputes': [_serialize_value(dispute) for dispute in disputes]})


@payments_bp.route('/disputes/<dispute_id>/resolve', methods=['PUT'])
@token_required
@admin_only
def resolve_dispute(dispute_id):
    identity = _get_identity()
    try:
        oid = _object_id(dispute_id, 'Litige')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    data = request.get_json() or {}
    resolution = (data.get('resolution') or '').strip().lower()
    if resolution not in {'release', 'refund', 'close'}:
        return jsonify({'error': 'Resolution invalide'}), 400
    dispute = mongo.db.disputes.find_one({'_id': oid})
    if not dispute:
        return jsonify({'error': 'Litige introuvable'}), 404
    tx = mongo.db.transactions.find_one({'_id': dispute.get('transaction_id')})
    if not tx:
        return jsonify({'error': 'Transaction introuvable'}), 404
    project = mongo.db.projects.find_one({'_id': tx.get('project_id')}) if tx.get('project_id') else None
    now = _now()
    if resolution == 'release' and tx.get('status') in {'held', 'disputed'}:
        mongo.db.transactions.update_one({'_id': tx['_id']}, {'$set': {'status': 'completed', 'escrow_status': 'released', 'released_at': now, 'updated_at': now}})
        _credit_freelancer_once(mongo.db.transactions.find_one({'_id': tx['_id']}))
        mongo.db.projects.update_one({'_id': tx.get('project_id')}, {'$set': {'status': 'completed', 'escrow_status': 'released', 'updated_at': now}})
    elif resolution == 'refund' and tx.get('status') in {'held', 'disputed'}:
        mongo.db.transactions.update_one({'_id': tx['_id']}, {'$set': {'status': 'refunded', 'escrow_status': 'refunded', 'refund_amount': _money(tx.get('client_pays')), 'refund_reason': data.get('note', ''), 'refunded_at': now, 'updated_at': now}})
        mongo.db.projects.update_one({'_id': tx.get('project_id')}, {'$set': {'status': 'refunded', 'escrow_status': 'refunded', 'updated_at': now}})
        refreshed_tx = mongo.db.transactions.find_one({'_id': tx['_id']})
        project_title = (project or {}).get('title', 'the project')
        reason = (data.get('note') or '').strip()
        reason_text = f" Reason: {reason}" if reason else ''
        _notify_project_participants(
            refreshed_tx,
            notif_type='escrow_refunded',
            title='Escrow refunded',
            body=f"Escrow for {project_title} was refunded to the client by admin.{reason_text}",
            actor_id=ObjectId(identity['id']),
            meta={
                'escrow_status': 'refunded',
                'refund_amount': refreshed_tx.get('refund_amount', 0),
                'reason': reason,
                'dispute_id': str(oid),
            },
        )
    elif resolution == 'close':
        mongo.db.transactions.update_one({'_id': tx['_id']}, {'$set': {'status': 'held', 'escrow_status': 'funded', 'updated_at': now}})
    mongo.db.disputes.update_one(
        {'_id': oid},
        {'$set': {'status': 'resolved', 'resolution': resolution, 'admin_note': data.get('note', ''), 'resolved_at': now, 'updated_at': now}}
    )
    return jsonify({'message': 'Litige resolu', 'dispute': _serialize_value(mongo.db.disputes.find_one({'_id': oid}))})


@payments_bp.route('/transactions/<tx_id>/invoice.pdf', methods=['GET'])
@token_required
def invoice_pdf(tx_id):
    identity = _get_identity()
    try:
        oid = _object_id(tx_id, 'Transaction')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    tx = mongo.db.transactions.find_one({'_id': oid})
    if not tx:
        return jsonify({'error': 'Transaction introuvable'}), 404
    if not _actor_can_view_tx(tx, identity):
        return jsonify({'error': 'Acces refuse'}), 403
    project = mongo.db.projects.find_one({'_id': tx.get('project_id')}) if tx.get('project_id') else None
    lines = [
        f"Facture: {tx.get('invoice_number') or str(tx['_id'])}",
        f"Date: {_serialize_value(tx.get('created_at'))}",
        f"Projet: {(project or {}).get('title', 'N/A')}",
        f"Statut: {tx.get('status', '')}",
        f"Montant mission: ${_money(tx.get('gross_amount'))}",
        f"Commission client: ${_money(tx.get('client_commission'))}",
        f"Total client: ${_money(tx.get('client_pays') or tx.get('amount'))}",
        f"Commission freelancer: ${_money(tx.get('freelancer_commission'))}",
        f"Net freelancer: ${_money(tx.get('freelancer_receives'))}",
        f"Revenus plateforme: ${_money(tx.get('platform_revenue'))}",
    ]
    pdf = _simple_pdf(lines)
    filename = f"{tx.get('invoice_number') or str(tx['_id'])}.pdf"
    return Response(pdf, mimetype='application/pdf', headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@payments_bp.route('/subscribe', methods=['POST'])
@token_required
def subscribe():
    identity  = _get_identity()
    data      = request.get_json()
    plan_slug = data.get('plan_slug', 'basic')

    plan = mongo.db.plans.find_one({'slug': plan_slug})
    if not plan:
        return jsonify({'error': 'Plan non trouvé'}), 404

    from datetime import timedelta
    now     = datetime.utcnow()
    expires = now + timedelta(days=30) if plan['price'] > 0 else None

    # Annuler l'abonnement actuel
    mongo.db.subscriptions.update_many(
        {'user_id': ObjectId(identity['id']), 'status': 'active'},
        {'$set': {'status': 'cancelled'}}
    )

    # Créer le nouvel abonnement
    sub = {
        'user_id':        ObjectId(identity['id']),
        'plan_id':        plan['_id'],
        'plan_slug':      plan_slug,
        'status':         'active',
        'started_at':     now,
        'expires_at':     expires,
        'auto_renew':     plan['price'] > 0,
        'payment_method': data.get('payment_method', 'card'),
        'created_at':     now
    }
    mongo.db.subscriptions.insert_one(sub)

    # Enregistrer la transaction si plan payant
    if plan['price'] > 0:
        mongo.db.transactions.insert_one({
            'type':           'subscription',
            'user_id':        ObjectId(identity['id']),
            'plan_slug':      plan_slug,
            'amount':         plan['price'],
            'currency':       'USD',
            'status':         'completed',
            'billing_period': 'month',
            'created_at':     now
        })

    return jsonify({
        'message':    f'Abonnement {plan["name"]} activé',
        'plan':       plan_slug,
        'expires_at': expires.isoformat() if expires else None,
        'trial_days': plan.get('trial_days', 0),
    }), 200


# ─────────────────────────────────────────────────────────
# Historique des transactions
# GET /api/payments/history
# ─────────────────────────────────────────────────────────
@payments_bp.route('/history', methods=['GET'])
@token_required
def get_history():
    identity = _get_identity()
    try:
        page = max(1, int(request.args.get('page', 1)))
        page_size = min(100, max(1, int(request.args.get('page_size', 50))))
        query = _build_tx_filters(identity)
    except ValueError:
        return jsonify({'error': 'Filtre de date invalide'}), 400

    total = mongo.db.transactions.count_documents(query)
    txs = list(
        mongo.db.transactions.find(query)
        .sort('created_at', -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )

    return jsonify({
        'transactions': [_serialize_value(tx) for tx in txs],
        'total': total,
        'page': page,
        'page_size': page_size,
    }), 200


# ─────────────────────────────────────────────────────────
# Statut de l'abonnement actuel
# GET /api/payments/subscription
# ─────────────────────────────────────────────────────────
@payments_bp.route('/subscription', methods=['GET'])
@token_required
def get_subscription():
    identity = _get_identity()
    sub      = mongo.db.subscriptions.find_one(
        {'user_id': ObjectId(identity['id']), 'status': 'active'},
        sort=[('created_at', -1)]
    )
    if not sub:
        return jsonify({'plan': 'none', 'status': 'no_subscription'}), 200

    plan = mongo.db.plans.find_one({'_id': sub['plan_id']})
    user = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})

    return jsonify({
        'plan':       sub['plan_slug'],
        'plan_name':  plan['name'] if plan else sub['plan_slug'],
        'price':      plan['price'] if plan else 0,
        'status':     sub['status'],
        'expires_at': sub['expires_at'].isoformat() if sub.get('expires_at') else None,
        'auto_renew': sub.get('auto_renew', False),
        'trial_used': user.get('trial_used', False) if user else False,
        'commission': {
            'client':     0 if not user.get('trial_used') else plan['limits']['commission_client'] if plan else 5,
            'freelancer': 0 if not user.get('trial_used') else plan['limits']['commission_freelancer'] if plan else 5,
        }
    }), 200
