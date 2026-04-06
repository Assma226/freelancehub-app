from flask import Blueprint, jsonify, request
from bson import ObjectId
from app import mongo
from app.middleware.auth import token_required, _get_identity
from app.utils.notifications import serialize_notification


notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('', methods=['GET'])
@token_required
def list_notifications():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    page = max(1, int(request.args.get('page', 1)))
    page_size = min(50, int(request.args.get('page_size', 20)))
    unread_only = request.args.get('unread_only') == 'true'
    query = {'user_id': uid}
    if unread_only:
        query['is_read'] = False

    skip = (page - 1) * page_size
    total = mongo.db.notifications.count_documents(query)
    unread_count = mongo.db.notifications.count_documents({'user_id': uid, 'is_read': False})
    docs = list(
        mongo.db.notifications.find(query)
        .sort('created_at', -1)
        .skip(skip)
        .limit(page_size)
    )

    return jsonify({
        'notifications': [serialize_notification(doc) for doc in docs],
        'total': total,
        'page': page,
        'page_size': page_size,
        'pages': (total + page_size - 1) // page_size,
        'unread_count': unread_count,
    })


@notifications_bp.route('/read-all', methods=['POST'])
@token_required
def read_all_notifications():
    identity = _get_identity()
    uid = ObjectId(identity['id'])
    mongo.db.notifications.update_many({'user_id': uid, 'is_read': False}, {'$set': {'is_read': True}})
    return jsonify({'message': 'Notifications marked as read'})


@notifications_bp.route('/<notification_id>/read', methods=['PUT'])
@token_required
def read_notification(notification_id: str):
    identity = _get_identity()
    uid = ObjectId(identity['id'])

    try:
        notif_oid = ObjectId(notification_id)
    except Exception:
        return jsonify({'error': 'Invalid notification id'}), 400

    result = mongo.db.notifications.update_one(
        {'_id': notif_oid, 'user_id': uid},
        {'$set': {'is_read': True}},
    )
    if result.matched_count == 0:
        return jsonify({'error': 'Notification not found'}), 404

    return jsonify({'message': 'Notification marked as read'})
