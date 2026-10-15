from pathlib import Path
import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from .routes.api import api


def create_app():
    frontend_dist = Path(__file__).resolve().parents[2] / "dist"
    app = Flask(__name__, static_folder=str(frontend_dist), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
    cors_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173",
        ).split(",")
        if origin.strip()
    ]
    CORS(app, supports_credentials=True, origins=cors_origins)
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/")
    def frontend():
        return send_from_directory(frontend_dist, "index.html")

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(error="Request body is too large."), 413

    @app.errorhandler(ValueError)
    def invalid_request(error):
        return jsonify(error=str(error)), 400

    return app
