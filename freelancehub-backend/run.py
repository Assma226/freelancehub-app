# run.py  —  Point d'entrée de l'application
# ══════════════════════════════════════════════════════════
#  Lancement :
#    python run.py                    # mode développement
#    FLASK_ENV=production python run.py
# ══════════════════════════════════════════════════════════

import os
from app import create_app

env = os.environ.get('FLASK_ENV', 'development')
app = create_app(env)

if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    debug = env == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)