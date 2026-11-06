import logging
from flask import Blueprint, request, jsonify
from models.price_predictor import PricePredictor

logger = logging.getLogger("ai_service.routes.price")
price_bp = Blueprint("price_bp", __name__)

_model_cache = {}

def get_price_predictor(crop_type: str) -> PricePredictor:
    crop_key = crop_type.lower().strip()
    if crop_key not in _model_cache:
        _model_cache[crop_key] = PricePredictor(crop_type=crop_key)
    return _model_cache[crop_key]

@price_bp.route("/predict-price", methods=["POST"])
def predict_price_endpoint():
    try:
        data = request.get_json(silent=True) or {}
        crop_type = data.get("crop_type")
        district = data.get("district")
        state = data.get("state")
        forecast_days = data.get("forecast_days", 7)
        
        if not crop_type:
            return jsonify({
                "error": {
                    "message": "Field 'crop_type' is required (e.g. mustard, soybean, groundnut).",
                    "code": "MISSING_CROP_TYPE"
                }
            }), 400
            
        try:
            forecast_days = int(forecast_days)
            if forecast_days not in [7, 14, 30]:
                # Allow flexible horizons between 1 and 60 days
                forecast_days = min(max(forecast_days, 1), 60)
        except (ValueError, TypeError):
            forecast_days = 7
            
        predictor = get_price_predictor(crop_type)
        result = predictor.predict(forecast_days=forecast_days, state=state, district=district)
        
        # Add request metadata echo
        result["district"] = district
        result["state"] = state
        result["forecast_days"] = forecast_days
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error executing price prediction: {e}", exc_info=True)
        return jsonify({
            "error": {
                "message": f"Price prediction failed: {str(e)}",
                "code": "PREDICTION_EXECUTION_ERROR"
            }
        }), 500
