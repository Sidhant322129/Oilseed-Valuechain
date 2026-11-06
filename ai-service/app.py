import os
import sys
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from routes.price_routes import price_bp
from routes.demand_routes import demand_bp
from routes.pest_routes import pest_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("ai_service")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Configure CORS
    CORS(
        app,
        resources={r"/api/*": {"origins": Config.ALLOWED_ORIGINS + ["*"]}},
        supports_credentials=True
    )
    
    # Register blueprints
    app.register_blueprint(price_bp, url_prefix="/api")
    app.register_blueprint(demand_bp, url_prefix="/api")
    app.register_blueprint(pest_bp, url_prefix="/api")
    
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "ok",
            "service": "Oilseed Value Chain AI Microservice",
            "version": "1.0.0",
            "models": {
                "price_prediction": "Random Forest Regressor (7/14/30d lag + harvest cycle)",
                "demand_forecasting": "Statsmodels Seasonal Decomposition + Trend"
            },
            "environment": Config.FLASK_ENV
        }), 200

    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({
            "error": {
                "message": "Resource endpoint not found on AI microservice.",
                "code": "NOT_FOUND"
            }
        }), 404

    @app.errorhandler(500)
    def handle_500(e):
        return jsonify({
            "error": {
                "message": "Internal AI microservice error.",
                "code": "INTERNAL_SERVER_ERROR"
            }
        }), 500

    return app

app = create_app()

if __name__ == "__main__":
    port = Config.PORT
    logger.info(f"🌾 Sovereign Harvest AI Microservice starting on http://localhost:{port}")
    
    # On Windows or local dev, Waitress or Flask dev server can be used
    if os.name == 'nt':
        try:
            from waitress import serve
            logger.info(f"Running with Waitress WSGI server on port {port}...")
            serve(app, host="0.0.0.0", port=port)
        except ImportError:
            logger.info("Waitress not found; falling back to Flask built-in server.")
            app.run(host="0.0.0.0", port=port, debug=Config.DEBUG)
    else:
        app.run(host="0.0.0.0", port=port, debug=Config.DEBUG)
