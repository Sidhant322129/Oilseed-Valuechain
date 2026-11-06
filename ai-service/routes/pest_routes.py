import logging
from flask import Blueprint, request, jsonify
from models.pest_classifier import PestClassifier

logger = logging.getLogger("pest_routes")
pest_bp = Blueprint("pest", __name__)

classifier = PestClassifier()

@pest_bp.route("/detect-pest", methods=["POST"])
def detect_pest():
    """
    POST /api/detect-pest
    Accepts multipart/form-data with an image file.
    Returns top-3 pest predictions with probabilities and remedies.
    """
    try:
        image_bytes = None

        # Case 1: Uploaded file
        if "image" in request.files:
            file = request.files["image"]
            image_bytes = file.read()

        if not image_bytes:
            return jsonify({
                "error": {
                    "message": "No leaf image provided. Upload an 'image' file.",
                    "code": "MISSING_IMAGE"
                }
            }), 400

        result = classifier.predict(image_bytes)
        return jsonify({
            "success": True,
            "data": result
        }), 200

    except Exception as e:
        logger.error(f"Pest detection error: {e}", exc_info=True)
        return jsonify({
            "error": {
                "message": f"Pest classification failed: {str(e)}",
                "code": "INFERENCE_ERROR"
            }
        }), 500
