import os
import json
import logging
import io
from pathlib import Path
import numpy as np
import tensorflow as tf
from PIL import Image
from utils.supabase_client import download_model_from_bucket

logger = logging.getLogger("pest_classifier")

# Comprehensive Remediation Advice & Risk Levels for Indian Oilseed Cultivation
DISEASE_KNOWLEDGE_BASE = {
    "bacterial_blight": {
        "display_name": "Bacterial Blight (Pseudomonas syringae)",
        "risk_level": "HIGH",
        "organic": "Spray 5% Neem Seed Kernel Extract (NSKE) or Neem Oil @ 5ml/L during early vegetative hours.",
        "chemical": "Spray Copper Oxychloride 50 WP @ 2.5 g/L + Streptocycline 1 g/10 L at 12-15 day intervals.",
        "cultural": "Avoid overhead sprinkler irrigation and remove crop residues after harvest."
    },
    "brown_spot": {
        "display_name": "Brown Spot (Septoria glycines)",
        "risk_level": "MEDIUM",
        "organic": "Foliar application of bio-agent Trichoderma viride @ 5g/L.",
        "chemical": "Spray Mancozeb 75% WP @ 2g/L or Carbendazim 50% WP @ 1g/L.",
        "cultural": "Practice crop rotation with non-host crops like maize or sorghum."
    },
    "crestamento": {
        "display_name": "Cercospora Leaf Blight (Crestamento)",
        "risk_level": "HIGH",
        "organic": "Foliar spray of fermented butter milk + asafoetida solution or bio-fungicides.",
        "chemical": "Spray Pyraclostrobin 20% WG @ 1g/L or Azoxystrobin 23% SC @ 1ml/L.",
        "cultural": "Use certified pathogen-free seeds and maintain proper row spacing."
    },
    "ferrugen": {
        "display_name": "Soybean Rust (Asian Rust / Ferrugem)",
        "risk_level": "CRITICAL",
        "organic": "Spray Pseudomonas fluorescens formulation @ 5g/L or raw sulfur dust.",
        "chemical": "Immediate application of Hexaconazole 5% EC @ 1ml/L or Propiconazole 25% EC @ 1ml/L.",
        "cultural": "Early sowing and regular canopy monitoring during high humidity seasons."
    },
    "mossaic_virus": {
        "display_name": "Soybean Mosaic Virus (SMV)",
        "risk_level": "HIGH",
        "organic": "Control aphid vectors using yellow sticky traps (10-12 traps/acre) and Neem soap spray.",
        "chemical": "Spray Imidacloprid 17.8% SL @ 0.3ml/L or Thiamethoxam 25% WG @ 0.3g/L for vector control.",
        "cultural": "Rogue out infected stunted plants and destroy immediately."
    },
    "powdery_mildew": {
        "display_name": "Powdery Mildew (Microsphaera diffusa)",
        "risk_level": "MEDIUM",
        "organic": "Spray milk-water solution (1:9) or wettable sulfur (Sulfex @ 3g/L).",
        "chemical": "Spray Dinocap 48% EC @ 1ml/L or Myclobutanil 10% WP @ 1g/L.",
        "cultural": "Ensure adequate sunlight penetration and avoid excess nitrogen fertilization."
    },
    "septoria": {
        "display_name": "Septoria Brown Spot",
        "risk_level": "MEDIUM",
        "organic": "Apply Bacillus subtilis culture spray @ 5ml/L at early canopy closure.",
        "chemical": "Spray Chlorothalonil 75% WP @ 2g/L or Tebuconazole 25.9% EC @ 1.5ml/L.",
        "cultural": "Deep summer plowing to bury infested overwintering debris."
    },
    "southern_blight": {
        "display_name": "Southern Blight (Sclerotium rolfsii)",
        "risk_level": "CRITICAL",
        "organic": "Soil application of Trichoderma harzianum enriched FYM (Farmyard Manure) @ 2.5 kg/acre.",
        "chemical": "Drench collar region with Carbendazim 12% + Mancozeb 63% WP (Saaf) @ 2g/L.",
        "cultural": "Improve field drainage and prevent water-logging near root zones."
    },
    "sudden_death_syndrone": {
        "display_name": "Sudden Death Syndrome (Fusarium virguliforme)",
        "risk_level": "CRITICAL",
        "organic": "Seed treatment with bio-formulation Trichoderma @ 10g/kg of seed.",
        "chemical": "Seed treatment with Fluopyram 500 SC @ 1.5ml/kg seed before sowing.",
        "cultural": "Alleviate soil compaction through sub-soiling and plant tolerant cultivars."
    },
    "yellow_mosaic": {
        "display_name": "Yellow Mosaic Virus (YMV - Whitefly vectored)",
        "risk_level": "CRITICAL",
        "organic": "Erect yellow sticky cards (15/acre); spray 5% Neem extract to deter whiteflies.",
        "chemical": "Spray Acetamiprid 20% SP @ 0.2g/L or Diafenthiuron 50% WP @ 1g/L to eliminate whitefly population.",
        "cultural": "Sow resistant/tolerant varieties like JS 335, JS 93-05, NRC 37."
    }
}

class PestClassifier:
    def __init__(self, weights_dir=None):
        if weights_dir is None:
            weights_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "weights")
        self.weights_dir = weights_dir
        self.model_path = os.path.join(weights_dir, "pest_classifier.h5")
        self.classes_path = os.path.join(weights_dir, "pest_classes.json")
        self.remote_model_path = "pest_classifier/pest_classifier.h5"
        self.remote_classes_path = "pest_classifier/pest_classes.json"
        self.model = None
        self.classes = {}
        self.load_model()

    def load_model(self):
        try:
            model_downloaded = download_model_from_bucket(
                self.remote_model_path, Path(self.model_path)
            )
            classes_downloaded = download_model_from_bucket(
                self.remote_classes_path, Path(self.classes_path)
            )
            if model_downloaded and classes_downloaded:
                logger.info("Loaded pest model artifacts from private Supabase Storage.")

            if os.path.exists(self.model_path) and os.path.exists(self.classes_path):
                logger.info(f"Loading CNN model from {self.model_path}...")
                self.model = tf.keras.models.load_model(self.model_path, compile=False)
                with open(self.classes_path, "r") as f:
                    self.classes = json.load(f)
                logger.info(f"Loaded {len(self.classes)} classes into PestClassifier.")
            else:
                logger.warning(f"Weights not found at {self.model_path}. Please run train_pest_model.py.")
        except Exception as e:
            logger.error(f"Failed to load pest classifier: {e}")

    def _normalize_name(self, name: str) -> str:
        return name.lower().replace(" ", "_").replace("-", "_")

    def predict(self, image_bytes: bytes) -> dict:
        if self.model is None:
            # Re-attempt load in case trained recently
            self.load_model()
            if self.model is None:
                raise RuntimeError("Pest classification model is not available. Please train weights first.")

        # Open and preprocess image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image = image.resize((128, 128))
        img_array = np.array(image, dtype=np.float32) / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        # Predict
        raw_predictions = self.model.predict(img_array)[0]
        sorted_indices = np.argsort(raw_predictions)[::-1]

        top_predictions = []
        for idx in sorted_indices[:3]:
            class_id_str = str(idx)
            class_name = self.classes.get(class_id_str, f"Class {idx}")
            prob = float(raw_predictions[idx])
            top_predictions.append({
                "disease": class_name,
                "probability": round(prob, 4),
                "confidence_score": round(prob * 100, 2)
            })

        primary = top_predictions[0]
        norm_key = self._normalize_name(primary["disease"])
        
        # Match knowledge base entry
        info = DISEASE_KNOWLEDGE_BASE.get(norm_key, {
            "display_name": primary["disease"],
            "risk_level": "HIGH" if primary["confidence_score"] > 60 else "MEDIUM",
            "organic": "Spray 5% Neem seed kernel extract (NSKE) or Neem oil (5ml/L).",
            "chemical": "Consult local Krishi Vigyan Kendra (KVK) specialist.",
            "cultural": "Ensure adequate spacing and soil drainage."
        })

        return {
            "primary_diagnosis": primary["disease"],
            "display_name": info.get("display_name", primary["disease"]),
            "confidence_score": primary["confidence_score"],
            "risk_level": info.get("risk_level", "MEDIUM"),
            "is_action_required": primary["confidence_score"] >= 50.0,
            "recommended_treatment": info.get("organic"),
            "chemical_treatment": info.get("chemical"),
            "cultural_treatment": info.get("cultural"),
            "top_predictions": top_predictions
        }
