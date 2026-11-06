# AI & Machine Learning Models Architecture (Weeks 5-6)

## Purpose & Storage Strategy

In Weeks 5 and 6, this project will integrate three core AI models:

1. **Pest & Disease Vision Model (Week 5)**:
   - Deep Convolutional Neural Network / Vision Transformer (YOLOv8 / EfficientNet) fine-tuned on oilseed pests (Mustard Aphids, Groundnut Leaf Spot, Soybean Rust, etc.).
   - Model artifact stored in Supabase private bucket: `ml-models/production/pest_vision_v1.onnx`.

2. **Yield & Price Forecasting Model (Week 5)**:
   - Multi-variate Time-Series / Gradient Boosted Model (LightGBM / XGBoost / Prophet) utilizing `weather_logs`, `land_records`, and `price_history`.
   - Model artifact stored in Supabase private bucket: `ml-models/production/yield_forecaster_v1.pkl`.

3. **Agrifinance Credit Scoring Engine (Week 6)**:
   - Scoring algorithm evaluating historical crop yield, land holdings, weather risk index, and previous repayment telemetry to compute an `ai_credit_score` (300–900).
   - Artifact: `ml-models/production/credit_scoring_v1.json`.

---

## Directory Layout for ML Services

```
ml-models/
├── README.md                # ML Architecture (this file)
├── notebooks/               # Jupyter / Colab exploratory data analysis
│   └── .gitkeep
├── training/                # Training pipelines and dataset loaders
│   └── .gitkeep
└── weights/                 # Local model checkpoints (gitignored)
    └── .gitkeep
```
