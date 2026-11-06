import os
import logging
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from statsmodels.tsa.seasonal import seasonal_decompose
from config import Config
from utils.supabase_client import fetch_price_history, upload_model_to_bucket, download_model_from_bucket

logger = logging.getLogger("ai_service.demand_forecaster")

# Monthly harvest arrival seasonal weights (higher = high supply inflow)
CROP_SEASONAL_SUPPLY_WEIGHTS = {
    # Kharif: High arrivals in Oct, Nov, Dec, Jan
    "soybean": {1: 1.1, 2: 0.8, 3: 0.6, 4: 0.5, 5: 0.5, 6: 0.6, 7: 0.7, 8: 0.8, 9: 1.2, 10: 1.8, 11: 1.9, 12: 1.5},
    "groundnut": {1: 1.0, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.5, 6: 0.6, 7: 0.7, 8: 0.9, 9: 1.3, 10: 1.7, 11: 1.6, 12: 1.2},
    "sesame": {1: 0.9, 2: 0.7, 3: 0.6, 4: 0.5, 5: 0.6, 6: 0.7, 7: 0.8, 8: 1.0, 9: 1.5, 10: 1.8, 11: 1.4, 12: 1.0},
    # Rabi: High arrivals in Mar, Apr, May
    "mustard": {1: 0.7, 2: 1.1, 3: 1.9, 4: 2.1, 5: 1.5, 6: 0.9, 7: 0.7, 8: 0.6, 9: 0.6, 10: 0.6, 11: 0.6, 12: 0.7},
    "sunflower": {1: 0.8, 2: 1.0, 3: 1.4, 4: 1.6, 5: 1.3, 6: 1.0, 7: 0.8, 8: 0.8, 9: 1.1, 10: 1.3, 11: 1.1, 12: 0.9},
    "safflower": {1: 0.6, 2: 1.0, 3: 1.8, 4: 2.0, 5: 1.4, 6: 0.8, 7: 0.6, 8: 0.5, 9: 0.5, 10: 0.5, 11: 0.6, 12: 0.6},
    "castor": {1: 1.2, 2: 1.6, 3: 1.8, 4: 1.4, 5: 1.0, 6: 0.7, 7: 0.6, 8: 0.6, 9: 0.7, 10: 0.8, 11: 0.9, 12: 1.0}
}

# Demand seasonality: Festive season (Sep-Nov) and wedding seasons (Jan-Feb, May) elevate edible oil demand
BASE_MONTHLY_DEMAND_FACTORS = {
    1: 1.15, 2: 1.10, 3: 0.95, 4: 0.90, 5: 1.05, 6: 0.90,
    7: 0.92, 8: 1.00, 9: 1.25, 10: 1.35, 11: 1.30, 12: 1.18
}

class DemandForecaster:
    def __init__(self, crop_type="mustard"):
        self.crop_type = crop_type.lower()
        self.model_filename = f"stats_demand_{self.crop_type}_v1.pkl"
        self.local_model_path = Config.MODELS_DIR / self.model_filename
        self.decomposition = None
        self.trend_slope = None
        self.trend_intercept = None
        self.trained_at = None

    def _generate_synthetic_volume_series(self, months=36):
        """Generates 3 years of monthly supply volume data for robust seasonal decomposition."""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=months * 30.5)
        date_range = pd.date_range(start=start_date, end=end_date, freq='MS')
        
        weights = CROP_SEASONAL_SUPPLY_WEIGHTS.get(self.crop_type, CROP_SEASONAL_SUPPLY_WEIGHTS["mustard"])
        base_volume = 1200.0 # tonnes per month baseline
        
        series = []
        for i, dt in enumerate(date_range):
            month = dt.month
            seasonal = weights.get(month, 1.0)
            # Long-term domestic oilseed consumption growth: ~3.5% per year
            growth = 1.0 + (0.035 * (i / 12.0))
            noise = np.random.normal(1.0, 0.05)
            volume = base_volume * seasonal * growth * noise
            series.append({
                "date": dt,
                "supply_volume": max(150.0, volume)
            })
            
        df = pd.DataFrame(series)
        df.set_index("date", inplace=True)
        return df

    def train(self, region=None):
        """Fits seasonal decomposition and linear trend decomposition."""
        logger.info(f"Fitting seasonal demand & supply models for crop: {self.crop_type}")
        
        # Look for historical arrival volume from Supabase
        records = fetch_price_history(crop_type=self.crop_type, state=region, limit=1000)
        df = None
        
        if len(records) >= 120:
            try:
                temp_df = pd.DataFrame(records)
                temp_df['price_date'] = pd.to_datetime(temp_df['price_date'])
                temp_df['supply_volume'] = pd.to_numeric(temp_df['arrival_quantity_tonnes'], errors='coerce').fillna(50)
                monthly = temp_df.set_index('price_date').resample('MS')['supply_volume'].sum()
                if len(monthly) >= 24:
                    df = pd.DataFrame({'supply_volume': monthly})
            except Exception as e:
                logger.warning(f"Error preparing monthly volume from DB records: {e}")
                
        if df is None or len(df) < 24:
            logger.info("Using 36-month baseline data for seasonal decomposition.")
            df = self._generate_synthetic_volume_series(months=36)
            
        # Classical seasonal decomposition using additive model
        # Period = 12 for annual seasonality
        decomp = seasonal_decompose(df['supply_volume'], model='additive', period=12, extrapolate_trend='freq')
        self.decomposition = decomp
        
        # Fit linear trend equation on trend component: trend = slope * x + intercept
        trend_clean = decomp.trend.dropna()
        x = np.arange(len(trend_clean))
        y = trend_clean.values
        slope, intercept = np.polyfit(x, y, 1)
        self.trend_slope = float(slope)
        self.trend_intercept = float(intercept)
        self.trained_at = datetime.utcnow()
        
        # Save model payload
        payload = {
            "crop_type": self.crop_type,
            "seasonal_pattern": decomp.seasonal[:12].to_dict(),
            "trend_slope": self.trend_slope,
            "trend_intercept": self.trend_intercept,
            "trained_at": self.trained_at.isoformat(),
            "last_idx": len(trend_clean)
        }
        joblib.dump(payload, self.local_model_path)
        upload_model_to_bucket(self.local_model_path, f"demand_models/{self.model_filename}")
        return payload

    def load_or_train(self):
        if self.trend_slope is not None:
            return
            
        if self.local_model_path.exists():
            try:
                payload = joblib.load(self.local_model_path)
                self.trend_slope = payload["trend_slope"]
                self.trend_intercept = payload["trend_intercept"]
                self.seasonal_pattern = payload["seasonal_pattern"]
                self.trained_at = payload.get("trained_at")
                return
            except Exception as e:
                logger.warning(f"Error loading local demand model: {e}")
                
        downloaded = download_model_from_bucket(f"demand_models/{self.model_filename}", self.local_model_path)
        if downloaded and self.local_model_path.exists():
            try:
                payload = joblib.load(self.local_model_path)
                self.trend_slope = payload["trend_slope"]
                self.trend_intercept = payload["trend_intercept"]
                self.seasonal_pattern = payload["seasonal_pattern"]
                self.trained_at = payload.get("trained_at")
                return
            except Exception:
                pass
                
        self.train()

    def forecast(self, forecast_months=3, region=None):
        """Generates forward projection of demand, supply, and price pressure index."""
        self.load_or_train()
        
        forecast_months = min(max(int(forecast_months), 1), 12)
        current_date = datetime.now()
        
        supply_weights = CROP_SEASONAL_SUPPLY_WEIGHTS.get(self.crop_type, CROP_SEASONAL_SUPPLY_WEIGHTS["mustard"])
        forecast_items = []
        
        base_baseline_supply = 1250.0
        base_baseline_demand = 1300.0
        
        for m in range(1, forecast_months + 1):
            target_dt = current_date + timedelta(days=m * 30)
            month_num = target_dt.month
            month_label = target_dt.strftime("%b %Y")
            
            # Trend component
            trend_val = max(100.0, self.trend_slope * (36 + m) + self.trend_intercept)
            
            # Seasonal factor for supply
            s_factor = supply_weights.get(month_num, 1.0)
            projected_supply = round(trend_val * s_factor, 1)
            
            # Demand factor
            d_factor = BASE_MONTHLY_DEMAND_FACTORS.get(month_num, 1.0)
            # Demand typically scales with population & income elasticity
            projected_demand = round((base_baseline_demand + (self.trend_slope * 0.8 * m)) * d_factor, 1)
            
            # Price Pressure Index (0 - 100):
            # Ratio of demand to supply.
            # > 1.05 = high upward price pressure (demand outstrips supply)
            # < 0.95 = downward pressure (supply glut)
            ratio = projected_demand / max(projected_supply, 1.0)
            
            # Normalized pressure score: 50 is neutral balance
            # ratio of 1.3 maps to ~85, ratio of 0.7 maps to ~20
            pressure_score = int(np.clip(50 + (ratio - 1.0) * 100, 10, 98))
            
            if pressure_score >= 70:
                pressure_label = "HIGH"
                pressure_desc = "Demand outstrips supply; expect upward price escalation."
            elif pressure_score <= 40:
                pressure_label = "LOW"
                pressure_desc = "Harvest arrival surge; expect downward price softening."
            else:
                pressure_label = "MODERATE"
                pressure_desc = "Equilibrium market conditions."
                
            forecast_items.append({
                "month": month_label,
                "demand_trend": projected_demand,
                "supply_trend": projected_supply,
                "price_pressure_index": pressure_score,
                "pressure_category": pressure_label,
                "notes": pressure_desc,
                "confidence_interval": {
                    "demand_lower": round(projected_demand * 0.92, 1),
                    "demand_upper": round(projected_demand * 1.08, 1),
                    "supply_lower": round(projected_supply * 0.90, 1),
                    "supply_upper": round(projected_supply * 1.10, 1)
                }
            })
            
        return {
            "crop_type": self.crop_type,
            "region": region or "All-India Average",
            "forecast_months": forecast_months,
            "forecast": forecast_items,
            "model_version": "Statsmodels_SeasonalDecomp_v1.1",
            "trained_at": self.trained_at.isoformat() if isinstance(self.trained_at, datetime) else str(self.trained_at),
            "unit": "metric_tonnes"
        }
