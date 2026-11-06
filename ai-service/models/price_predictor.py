import os
import logging
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from config import Config
from utils.supabase_client import fetch_price_history, upload_model_to_bucket, download_model_from_bucket

logger = logging.getLogger("ai_service.price_predictor")

BASE_PRICE_BENCHMARKS = {
    "mustard": 5650.0,
    "soybean": 4892.0,
    "groundnut": 6783.0,
    "sunflower": 6760.0,
    "sesame": 8635.0,
    "safflower": 5800.0,
    "castor": 5950.0,
}

HARVEST_SEASONS = {
    # Kharif crops harvested Sep-Dec
    "soybean": [9, 10, 11, 12],
    "groundnut": [9, 10, 11, 12],
    "sesame": [9, 10, 11],
    # Rabi crops harvested Feb-May
    "mustard": [2, 3, 4, 5],
    "safflower": [2, 3, 4],
    "sunflower": [2, 3, 4, 5, 9, 10],
    "castor": [1, 2, 3, 4]
}

class PricePredictor:
    def __init__(self, crop_type="mustard"):
        self.crop_type = crop_type.lower()
        self.model = None
        self.model_filename = f"rf_price_{self.crop_type}_v1.pkl"
        self.local_model_path = Config.MODELS_DIR / self.model_filename
        self.trained_at = None

    def _generate_synthetic_baseline(self, days=365):
        """Generates realistic daily price series if historical records in DB are scarce."""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        dates = pd.date_range(start=start_date, end=end_date, freq='D')
        
        base_price = BASE_PRICE_BENCHMARKS.get(self.crop_type, 5500.0)
        harvest_months = HARVEST_SEASONS.get(self.crop_type, [10, 11, 12])
        
        records = []
        current_price = base_price
        
        for d in dates:
            # Seasonality: Harvest arrival causes slight price dip (-3% to -8%), off-season price increases
            month = d.month
            seasonal_factor = -0.05 if month in harvest_months else 0.03
            
            # Random market fluctuation (-2% to +2%)
            shock = np.random.normal(0, 0.015)
            
            current_price = current_price * (1.0 + (seasonal_factor / 30.0) + shock)
            # Bound around baseline
            current_price = max(base_price * 0.75, min(base_price * 1.35, current_price))
            
            records.append({
                "price_date": d.strftime("%Y-%m-%d"),
                "crop_type": self.crop_type,
                "modal_price_per_quintal": round(float(current_price), 2),
                "arrival_quantity_tonnes": round(float(np.random.uniform(20, 350)), 2)
            })
            
        return pd.DataFrame(records)

    def _prepare_features(self, df: pd.DataFrame):
        """Builds lag, rolling volatility, and calendar seasonality features."""
        df = df.copy()
        df['price_date'] = pd.to_datetime(df['price_date'])
        df = df.sort_values('price_date').reset_index(drop=True)
        
        # Ensure modal_price is numeric
        df['price'] = pd.to_numeric(df['modal_price_per_quintal'], errors='coerce')
        df['price'] = df['price'].ffill().bfill()
        
        # 1. Lag features: 1-day, 7-day, 14-day, 30-day
        df['lag_1'] = df['price'].shift(1)
        df['lag_7'] = df['price'].shift(7)
        df['lag_14'] = df['price'].shift(14)
        df['lag_30'] = df['price'].shift(30)
        
        # 2. Rolling statistics
        df['rolling_mean_7'] = df['price'].rolling(window=7, min_periods=1).mean()
        df['rolling_std_7'] = df['price'].rolling(window=7, min_periods=1).std().fillna(0)
        df['rolling_mean_30'] = df['price'].rolling(window=30, min_periods=1).mean()
        
        # 3. Calendar & Seasonality features
        df['month'] = df['price_date'].dt.month
        df['dayofweek'] = df['price_date'].dt.dayofweek
        df['dayofyear'] = df['price_date'].dt.dayofyear
        
        harvest_months = HARVEST_SEASONS.get(self.crop_type, [10, 11, 12])
        df['is_harvest_season'] = df['month'].apply(lambda m: 1 if m in harvest_months else 0)
        
        # Drop rows with NaN due to 30-day lag
        df_clean = df.dropna(subset=['lag_1', 'lag_7', 'lag_14', 'lag_30']).reset_index(drop=True)
        return df_clean

    def train(self, state=None, district=None):
        """Trains Random Forest model using DB data or bootstrapped baseline."""
        logger.info(f"Training price model for crop: {self.crop_type}")
        
        raw_data = fetch_price_history(crop_type=self.crop_type, state=state, district=district, limit=1000)
        if len(raw_data) >= 40:
            df = pd.DataFrame(raw_data)
        else:
            logger.info(f"Only {len(raw_data)} price records found in DB. Augmenting with synthetic baseline.")
            df = self._generate_synthetic_baseline(days=365)
            
        features_df = self._prepare_features(df)
        if len(features_df) < 10:
            features_df = self._prepare_features(self._generate_synthetic_baseline(days=365))
            
        feature_cols = [
            'lag_1', 'lag_7', 'lag_14', 'lag_30',
            'rolling_mean_7', 'rolling_std_7', 'rolling_mean_30',
            'month', 'dayofweek', 'dayofyear', 'is_harvest_season'
        ]
        
        X = features_df[feature_cols]
        y = features_df['price']
        
        rf = RandomForestRegressor(
            n_estimators=100,
            max_depth=12,
            min_samples_split=4,
            min_samples_leaf=2,
            random_state=42
        )
        rf.fit(X, y)
        
        self.model = rf
        self.trained_at = datetime.utcnow()
        
        # Save locally
        model_payload = {
            "model": self.model,
            "feature_cols": feature_cols,
            "crop_type": self.crop_type,
            "trained_at": self.trained_at.isoformat(),
            "last_price": float(y.iloc[-1]),
            "last_row": features_df.iloc[-1].to_dict()
        }
        joblib.dump(model_payload, self.local_model_path)
        logger.info(f"Saved local model to {self.local_model_path}")
        
        # Upload to Supabase Storage bucket
        upload_model_to_bucket(self.local_model_path, f"price_models/{self.model_filename}")
        return self.model

    def load_or_train(self):
        """Loads cached model from disk or Supabase, or trains a new one."""
        if self.model is not None:
            return self.model
            
        if self.local_model_path.exists():
            try:
                payload = joblib.load(self.local_model_path)
                self.model = payload["model"]
                self.trained_at = payload.get("trained_at")
                logger.info(f"Loaded existing model from {self.local_model_path}")
                return self.model
            except Exception as e:
                logger.warning(f"Failed loading local model file: {e}")
                
        # Try downloading from Supabase bucket
        downloaded = download_model_from_bucket(f"price_models/{self.model_filename}", self.local_model_path)
        if downloaded and self.local_model_path.exists():
            try:
                payload = joblib.load(self.local_model_path)
                self.model = payload["model"]
                self.trained_at = payload.get("trained_at")
                return self.model
            except Exception:
                pass
                
        return self.train()

    def predict(self, forecast_days=7, state=None, district=None):
        """Multi-step recursive forecasting with tree-variance confidence intervals."""
        self.load_or_train()
        
        # Get recent history
        raw_data = fetch_price_history(crop_type=self.crop_type, state=state, district=district, limit=60)
        if len(raw_data) >= 30:
            recent_df = pd.DataFrame(raw_data)
        else:
            recent_df = self._generate_synthetic_baseline(days=60)
            
        recent_df['price_date'] = pd.to_datetime(recent_df['price_date'])
        recent_df = recent_df.sort_values('price_date').reset_index(drop=True)
        recent_prices = list(pd.to_numeric(recent_df['modal_price_per_quintal'], errors='coerce').ffill())
        
        predictions = []
        current_date = datetime.now()
        harvest_months = HARVEST_SEASONS.get(self.crop_type, [10, 11, 12])
        
        # Recursive prediction loop
        simulated_prices = list(recent_prices)
        
        for step in range(1, int(forecast_days) + 1):
            pred_date = current_date + timedelta(days=step)
            
            # Compute lags from simulated_prices
            lag_1 = simulated_prices[-1]
            lag_7 = simulated_prices[-7] if len(simulated_prices) >= 7 else simulated_prices[0]
            lag_14 = simulated_prices[-14] if len(simulated_prices) >= 14 else simulated_prices[0]
            lag_30 = simulated_prices[-30] if len(simulated_prices) >= 30 else simulated_prices[0]
            
            rolling_7 = float(np.mean(simulated_prices[-7:]))
            rolling_std_7 = float(np.std(simulated_prices[-7:])) if len(simulated_prices) >= 7 else 10.0
            rolling_30 = float(np.mean(simulated_prices[-30:]))
            
            is_harvest = 1 if pred_date.month in harvest_months else 0
            
            input_features = np.array([[
                lag_1, lag_7, lag_14, lag_30,
                rolling_7, rolling_std_7, rolling_30,
                pred_date.month, pred_date.weekday(), pred_date.timetuple().tm_yday, is_harvest
            ]])
            
            # Get individual tree predictions to compute confidence intervals
            tree_predictions = [tree.predict(input_features)[0] for tree in self.model.estimators_]
            mean_pred = float(np.mean(tree_predictions))
            std_pred = float(np.std(tree_predictions))
            
            # 95% Confidence Interval (approx +/- 1.96 * std)
            lower_bound = max(round(mean_pred - (1.96 * std_pred), 2), round(mean_pred * 0.85, 2))
            upper_bound = min(round(mean_pred + (1.96 * std_pred), 2), round(mean_pred * 1.15, 2))
            
            predictions.append({
                "date": pred_date.strftime("%Y-%m-%d"),
                "predicted_price_per_quintal": round(mean_pred, 2),
                "confidence_interval": {
                    "lower": lower_bound,
                    "upper": upper_bound
                }
            })
            
            # Feed prediction back into sequence for next step
            simulated_prices.append(mean_pred)
            
        return {
            "crop_type": self.crop_type,
            "predictions": predictions,
            "model_version": "RandomForest_v1.2",
            "trained_at": self.trained_at.isoformat() if isinstance(self.trained_at, datetime) else str(self.trained_at),
            "currency": "INR",
            "unit": "per_quintal"
        }
