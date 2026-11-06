// backend/src/config/priceAlert.config.js
// Central configuration for the threshold-based oilseed price alert engine.
// All values are explicitly named constants with environment overrides.

export const PRICE_ALERT_CONFIG = {
  // Percentage threshold for detecting a meaningful price increase.
  // Default: 5.0% increase over the last recorded price for that crop.
  // Can be configured via environment variable PRICE_ALERT_SURGE_THRESHOLD_PCT.
  DEFAULT_PRICE_SURGE_THRESHOLD_PCT: Number(process.env.PRICE_ALERT_SURGE_THRESHOLD_PCT) || 5.0,

  // Priority thresholds based on percentage increase:
  // >= 15.0%: urgent (substantial market shift)
  // >= 10.0%: high (strong upward surge)
  // >= 5.0%: normal (meaningful increase meeting alert threshold)
  PRIORITY_THRESHOLDS: {
    URGENT_PCT: 15.0,
    HIGH_PCT: 10.0,
  },

  // Alert expiration window in days for automated or manual cleanup.
  // Price alerts older than this number of days can be purged.
  ALERT_EXPIRY_DAYS: Number(process.env.PRICE_ALERT_EXPIRY_DAYS) || 30,

  // Max alerts returned per query on the dashboard
  DEFAULT_LIMIT: 20,
};

export default PRICE_ALERT_CONFIG;
