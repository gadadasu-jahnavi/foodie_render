import os
import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, redirect, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash

from config import Config
from models import Admin, db
from netutil import lan_ip
from routes import admin, customer, public, rider, seller

PANELS = {"admin": "admin", "seller": "seller", "rider": "rider", "customer": "customer"}


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    if config:
        app.config.update(config)
    CORS(app, resources={r"/api/*": {"origins": "*"}})   # panels are same-origin; CORS only helps if you host them elsewhere
    db.init_app(app)

    for bp in (public.bp, customer.bp, seller.bp, rider.bp, admin.bp):
        app.register_blueprint(bp)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(404)
    def nf(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(413)
    def too_big(e):
        return jsonify({"error": "Upload too large"}), 413

    @app.errorhandler(500)
    def boom(e):
        return jsonify({"error": "Something went wrong on the server"}), 500

    # ---- serve the four front-ends: /admin/  /seller/  /rider/  /customer/
    front = Path(app.config["FRONTEND_DIR"])

    @app.get("/")
    def home():
        # Opening the site goes straight to the admin panel. The seller / rider / customer
        # panels are still served, but only at their own links (shown inside the admin panel).
        return redirect("/admin/", code=302)

    @app.get("/<panel>/")
    def panel_index(panel):
        if panel not in PANELS:
            return jsonify({"error": "Not found"}), 404
        entry = {"seller": "seller-account.html", "rider": "login.html", "customer": "login.html"}.get(panel, "index.html")
        return send_from_directory(front / panel, entry)

    @app.get("/<panel>/<path:name>")
    def panel_file(panel, name):
        if panel not in PANELS:
            return jsonify({"error": "Not found"}), 404
        return send_from_directory(front / panel, name)

    with app.app_context():
        db.create_all()
        if not Admin.query.first():
            db.session.add(Admin(name="Admin", email=app.config["ADMIN_EMAIL"],
                                 password_hash=generate_password_hash(app.config["ADMIN_PASSWORD"])))
            db.session.commit()
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG") == "1"
    ip = lan_ip()
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        print("\n  Foodie is running")
        print(f"  Admin panel (this computer) : http://localhost:{port}/admin/")
        print(f"  Share with seller/rider/customer devices on the same network:")
        print(f"     Seller   : http://{ip}:{port}/seller/seller-registration.html")
        print(f"     Rider    : http://{ip}:{port}/rider/index.html")
        print(f"     Customer : http://{ip}:{port}/customer/register.html\n")
    if os.environ.get("NO_BROWSER") != "1" and not (debug and os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{port}/admin/")).start()
    create_app().run(host="0.0.0.0", port=port, debug=debug)
