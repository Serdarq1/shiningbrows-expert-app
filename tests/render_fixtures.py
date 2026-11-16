import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
with app.app.test_request_context('/'):
    fixtures = {name: app.render_template(name + '.html', clerk_key='', clerk_issuer='') for name in ['dashboard', 'login']}
    fixtures['product'] = app.render_template('product.html', product={'id':1, 'name':'Brow Henna Dark', 'price':250, 'usage':'professional'}, steps=[], related=[], image_filename='img/product-images/Brow Henna Dark.webp')
    print(json.dumps(fixtures))
