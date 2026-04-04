# app/routes/payments.py
# ══════════════════════════════════════════════════════════
# Routes de paiement et commission
#
# Modèle :
#   ✅ 1er projet → 0% commission (essai gratuit)
#   ✅ Projets suivants → 5% client + 5% freelancer
#   ✅ Abonnement Basic $19/mois
# ══════════════════════════════════════════════════════════

from flask import Blueprint, request, jsonify
from app import mongo
from app.middleware.auth import token_required, client_only, _get_identity
from bson import ObjectId
from datetime import datetime

payments_bp = Blueprint('payments', __name__)

COMMISSION_RATE = 0.05  # 5%


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
    else:
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


# ─────────────────────────────────────────────────────────
# Finaliser un paiement de projet
# POST /api/payments/project/:project_id/pay
# Body: { freelancer_id, agreed_amount }
# ─────────────────────────────────────────────────────────
@payments_bp.route('/project/<project_id>/pay', methods=['POST'])
@client_only
def pay_project(project_id):
    identity      = _get_identity()
    data          = request.get_json()
    agreed_amount = float(data.get('agreed_amount', 0))
    freelancer_id = data.get('freelancer_id')

    client = mongo.db.users.find_one({'_id': ObjectId(identity['id'])})
    if not client:
        return jsonify({'error': 'Client non trouvé'}), 404

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

    # Enregistrer la transaction
    transaction = {
        'type':                   'project_payment',
        'project_id':             ObjectId(project_id),
        'client_id':              ObjectId(identity['id']),
        'freelancer_id':          ObjectId(freelancer_id) if freelancer_id else None,
        'gross_amount':           agreed_amount,
        'client_pays':            client_pays,
        'client_commission':      client_commission if not is_trial else 0,
        'freelancer_receives':    freelancer_receives,
        'freelancer_commission':  freelancer_commission if not is_trial else 0,
        'platform_revenue':       platform_revenue if not is_trial else 0,
        'currency':               'USD',
        'status':                 'completed',
        'is_trial':               is_trial,
        'created_at':             datetime.utcnow()
    }
    mongo.db.transactions.insert_one(transaction)

    # Mettre à jour le projet
    mongo.db.projects.update_one(
        {'_id': ObjectId(project_id)},
        {'$set': {
            'status':                     'in-progress',
            'assigned_freelancer_id':     ObjectId(freelancer_id) if freelancer_id else None,
            'is_trial_project':           is_trial,
            'commission_rate_client':     0 if is_trial else COMMISSION_RATE * 100,
            'commission_rate_freelancer': 0 if is_trial else COMMISSION_RATE * 100,
        }}
    )

    # Marquer le trial comme utilisé si c'était le 1er projet
    if is_trial:
        mongo.db.users.update_one(
            {'_id': ObjectId(identity['id'])},
            {'$set': {'trial_used': True}}
        )

    # Mettre à jour les earnings du freelancer
    if freelancer_id:
        mongo.db.freelancers.update_one(
            {'user_id': ObjectId(freelancer_id)},
            {'$inc': {
                'earnings_total':      agreed_amount,
                'earnings_after_fees': freelancer_receives,
                'platform_fees_paid':  freelancer_commission if not is_trial else 0,
                'completed_jobs':      1,
            }}
        )

    return jsonify({
        'message':             'Paiement effectué',
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
    user_id  = ObjectId(identity['id'])
    role     = identity['role']

    query = {}
    if role == 'client':
        query['client_id'] = user_id
    else:
        query['freelancer_id'] = user_id

    txs = list(mongo.db.transactions.find(query).sort('created_at', -1).limit(50))
    for t in txs:
        t['_id']           = str(t['_id'])
        t['project_id']    = str(t.get('project_id', ''))
        t['client_id']     = str(t.get('client_id', ''))
        t['freelancer_id'] = str(t.get('freelancer_id', ''))
        t['created_at']    = t['created_at'].isoformat()

    return jsonify(txs), 200


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