from datetime import datetime, timezone
from bson import ObjectId
from app import mongo


def create_notification(
    user_id,
    notif_type: str,
    title: str,
    body: str,
    actor_id=None,
    entity_id=None,
    entity_type: str = '',
    meta: dict | None = None,
):
    try:
        target_user = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id
    except Exception:
        return None

    now = datetime.now(timezone.utc)
    document = {
        'user_id': target_user,
        'type': notif_type,
        'title': title.strip(),
        'body': body.strip(),
        'is_read': False,
        'created_at': now,
        'updated_at': now,
        'meta': meta or {},
    }

    if actor_id:
        try:
            document['actor_id'] = ObjectId(actor_id) if not isinstance(actor_id, ObjectId) else actor_id
        except Exception:
            pass

    if entity_id:
        try:
            document['entity_id'] = ObjectId(entity_id) if not isinstance(entity_id, ObjectId) else entity_id
        except Exception:
            document['entity_id'] = entity_id

    if entity_type:
        document['entity_type'] = entity_type

    return mongo.db.notifications.insert_one(document)


def serialize_notification(doc: dict) -> dict:
    item = {
        'id': str(doc.get('_id')),
        'user_id': str(doc.get('user_id', '')),
        'type': doc.get('type', ''),
        'title': doc.get('title', ''),
        'body': doc.get('body', ''),
        'is_read': bool(doc.get('is_read', False)),
        'created_at': doc.get('created_at'),
        'updated_at': doc.get('updated_at'),
        'entity_type': doc.get('entity_type', ''),
        'meta': doc.get('meta', {}),
    }

    if doc.get('actor_id'):
        item['actor_id'] = str(doc['actor_id'])
    if doc.get('entity_id') is not None:
        item['entity_id'] = str(doc['entity_id'])

    actor = None
    if doc.get('actor_id'):
        actor = mongo.db.users.find_one({'_id': doc['actor_id']}, {'name': 1, 'avatar': 1})
    if actor:
        item['actor_name'] = actor.get('name', '')
        item['actor_avatar'] = actor.get('avatar', '')

    return item
