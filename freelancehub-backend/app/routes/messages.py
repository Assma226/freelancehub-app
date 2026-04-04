# app/routes/messages.py
# ══════════════════════════════════════════════════════════════════════════
#  Messages API
#
#  GET    /api/messages                → conversations du user connecté
#  GET    /api/messages/<conv_id>      → messages d'une conversation
#  POST   /api/messages/<conv_id>      → envoyer un message
#  POST   /api/messages/new            → démarrer une nouvelle conversation
# ══════════════════════════════════════════════════════════════════════════

from flask               import Blueprint, request, jsonify
from app                 import mongo
from app.middleware.auth import token_required, _get_identity
from bson                import ObjectId
from datetime            import datetime, timezone

messages_bp = Blueprint('messages', __name__)


# ── GET /api/messages  — toutes les conversations ────────────────────────
@messages_bp.route('', methods=['GET'])
@token_required
def list_conversations():
    identity = _get_identity()
    uid      = ObjectId(identity['id'])

    convs = list(mongo.db.conversations.find({'participants': uid}))

    def _conv_sort_key(doc):
        return doc.get('updated_at') or doc.get('last_at') or doc.get('created_at')

    convs.sort(key=_conv_sort_key, reverse=True)

    result = []
    for c in convs:
        c['id'] = str(c.pop('_id'))
        c['participants'] = [str(p) for p in c.get('participants', [])]

        # Dernier message
        last_msg = mongo.db.messages.find_one(
            {'conversation_id': ObjectId(c['id'])},
            sort=[('created_at', -1)]
        )
        if last_msg:
            body = last_msg.get('text') or last_msg.get('content', '')
            c['last_message']    = body
            c['last_message_at'] = last_msg.get('created_at')

        # Unread count
        c['unread_count'] = mongo.db.messages.count_documents({
            'conversation_id': ObjectId(c['id']),
            'sender_id':       {'$ne': uid},
            'is_read':         False,
        })

        result.append(c)

    return jsonify({'conversations': result})


# ── GET /api/messages/<conv_id>  — messages d'une conversation ───────────
@messages_bp.route('/<conv_id>', methods=['GET'])
@token_required
def get_messages(conv_id: str):
    identity = _get_identity()
    uid      = ObjectId(identity['id'])

    try:
        conv_oid = ObjectId(conv_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    # Vérifier que l'utilisateur est bien un participant
    conv = mongo.db.conversations.find_one({'_id': conv_oid, 'participants': uid})
    if not conv:
        return jsonify({'error': 'Conversation introuvable ou accès refusé'}), 404

    page      = max(1, int(request.args.get('page', 1)))
    page_size = min(100, int(request.args.get('page_size', 50)))
    skip      = (page - 1) * page_size

    msgs = list(
        mongo.db.messages.find({'conversation_id': conv_oid})
                         .sort('created_at', 1)
                         .skip(skip)
                         .limit(page_size)
    )

    for m in msgs:
        m['id']              = str(m.pop('_id'))
        m['conversation_id'] = str(m['conversation_id'])
        m['sender_id']       = str(m['sender_id'])
        if m.get('content') and not m.get('text'):
            m['text'] = m['content']

    # Marquer comme lu
    mongo.db.messages.update_many(
        {'conversation_id': conv_oid, 'sender_id': {'$ne': uid}, 'is_read': False},
        {'$set': {'is_read': True}}
    )

    return jsonify({'messages': msgs, 'total': len(msgs)})


# ── POST /api/messages/<conv_id>  — envoyer un message ───────────────────
@messages_bp.route('/<conv_id>', methods=['POST'])
@token_required
def send_message(conv_id: str):
    identity = _get_identity()
    uid      = ObjectId(identity['id'])
    data     = request.get_json()
    text     = data.get('text', '').strip()

    if not text:
        return jsonify({'error': 'Message vide'}), 400

    try:
        conv_oid = ObjectId(conv_id)
    except Exception:
        return jsonify({'error': 'ID invalide'}), 400

    conv = mongo.db.conversations.find_one({'_id': conv_oid, 'participants': uid})
    if not conv:
        return jsonify({'error': 'Conversation introuvable'}), 404

    now = datetime.now(timezone.utc)
    msg = {
        'conversation_id': conv_oid,
        'sender_id':       uid,
        'text':            text,
        'is_read':         False,
        'created_at':      now,
    }

    result = mongo.db.messages.insert_one(msg)
    mongo.db.conversations.update_one(
        {'_id': conv_oid},
        {'$set': {'updated_at': now, 'last_message': text}}
    )

    return jsonify({'message_id': str(result.inserted_id), 'text': text}), 201


# ── POST /api/messages/new  — démarrer une conversation ──────────────────
@messages_bp.route('/new', methods=['POST'])
@token_required
def new_conversation():
    identity     = _get_identity()
    uid          = ObjectId(identity['id'])
    data         = request.get_json()
    recipient_id = data.get('recipient_id')
    first_msg    = data.get('message', '').strip()

    if not recipient_id:
        return jsonify({'error': 'recipient_id requis'}), 400

    try:
        rid = ObjectId(recipient_id)
    except Exception:
        return jsonify({'error': 'recipient_id invalide'}), 400

    # Vérifier si une conversation existe déjà entre ces deux users
    existing = mongo.db.conversations.find_one({
        'participants': {'$all': [uid, rid], '$size': 2}
    })

    now = datetime.now(timezone.utc)

    if existing:
        conv_id = existing['_id']
    else:
        result  = mongo.db.conversations.insert_one({
            'participants': [uid, rid],
            'created_at':  now,
            'updated_at':  now,
            'last_message': first_msg,
        })
        conv_id = result.inserted_id

    if first_msg:
        mongo.db.messages.insert_one({
            'conversation_id': conv_id,
            'sender_id':       uid,
            'text':            first_msg,
            'is_read':         False,
            'created_at':      now,
        })

    return jsonify({'conversation_id': str(conv_id)}), 201