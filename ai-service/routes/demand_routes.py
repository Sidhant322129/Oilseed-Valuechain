import logging
from flask import Blueprint, request, jsonify
from models.demand_forecaster import DemandForecaster

logger = logging.getLogger("ai_service.routes.demand")
demand_bp = Blueprint("demand_bp", __name__)

_demand_model_cache = {}

def get_demand_forecaster(crop_type: str) -> DemandForecaster:
    crop_key = crop_type.lower().strip()
    if crop_key not in _demand_model_cache:
        _demand_model_cache[crop_key] = DemandForecaster(crop_type=crop_key)
    return _demand_model_cache[crop_key]

@demand_bp.route("/forecast-demand", methods=["POST"])
def forecast_demand_endpoint():
    try:
        data = request.get_json(silent=True) or {}
        crop_type = data.get("crop_type")
        region = data.get("region") or data.get("state")
        forecast_months = data.get("forecast_months", 3)
        
        if not crop_type:
            return jsonify({
                "error": {
                    "message": "Field 'crop_type' is required (e.g. mustard, soybean, groundnut).",
                    "code": "MISSING_CROP_TYPE"
                }
            }), 400
            
        try:
            forecast_months = int(forecast_months)
            forecast_months = min(max(forecast_months, 1), 12)
        except (ValueError, TypeError):
            forecast_months = 3
            
        forecaster = get_demand_forecaster(crop_type)
        result = forecaster.forecast(forecast_months=forecast_months, region=region)
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error executing demand forecast: {e}", exc_info=True)
        return jsonify({
            "error": {
                "message": f"Demand forecasting failed: {str(e)}",
                "code": "FORECAST_EXECUTION_ERROR"
            }
        }), 500
