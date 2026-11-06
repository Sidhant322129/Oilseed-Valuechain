// ============================================================================
// Database Constants — mirrors Supabase schema enums exactly
// Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
// ============================================================================

// User Roles — canonical 6-role set matching:
//   - public.user_role DB enum (migration 00006)
//   - DashboardRouter.jsx DASHBOARD_MAP keys
//   - All 6 role-specific dashboards
// DO NOT add values here without also updating: DashboardRouter.jsx,
// supabase/migrations/00006_fix_role_enum_and_trigger.sql, and Login.jsx ROLE_OPTIONS.
export const USER_ROLES = {
  FARMER:     'farmer',
  FPO:        'fpo',
  PROCESSOR:  'processor',
  RETAILER:   'retailer',
  GOVERNMENT: 'government',
  ADMIN:      'admin',
};

// KYC Status
export const KYC_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

// Soil Types
export const SOIL_TYPES = {
  BLACK_SOIL: 'black_soil',
  ALLUVIAL_SOIL: 'alluvial_soil',
  RED_SOIL: 'red_soil',
  SANDY_LOAM: 'sandy_loam',
  CLAY_LOAM: 'clay_loam',
  LATERITE_SOIL: 'laterite_soil',
};

// Irrigation Types
export const IRRIGATION_TYPES = {
  DRIP: 'drip_irrigation',
  SPRINKLER: 'sprinkler',
  CANAL: 'canal_water',
  BOREWELL: 'borewell',
  RAINFED: 'rainfed',
  FLOOD_FURROW: 'flood_furrow',
};

// Oilseed Crop Types
export const OILSEED_CROPS = {
  MUSTARD: 'mustard',
  GROUNDNUT: 'groundnut',
  SOYBEAN: 'soybean',
  SUNFLOWER: 'sunflower',
  SESAME: 'sesame',
  SAFFLOWER: 'safflower',
  CASTOR: 'castor',
  NIGER: 'niger',
};

// Crop Seasons
export const CROP_SEASONS = {
  KHARIF: 'kharif',
  RABI: 'rabi',
  ZAID: 'zaid',
};

// Crop Status
export const CROP_STATUS = {
  SOWN: 'sown',
  VEGETATIVE: 'vegetative',
  FLOWERING: 'flowering',
  POD_FORMATION: 'pod_formation',
  MATURE: 'mature',
  HARVESTED: 'harvested',
  FAILED: 'failed',
};

// Quality Grades
export const QUALITY_GRADES = {
  PENDING_TESTING: 'pending_testing',
  GRADE_A: 'grade_a_premium',
  GRADE_B: 'grade_b_standard',
  GRADE_C: 'grade_c_fair',
  REJECTED: 'rejected',
};

// Batch Status
export const BATCH_STATUS = {
  HARVESTED: 'harvested',
  QUALITY_TESTED: 'quality_tested',
  IN_WAREHOUSE: 'in_warehouse',
  LISTED_FOR_SALE: 'listed_for_sale',
  SOLD: 'sold',
  DISPATCHED: 'dispatched',
};

// Payment Status
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  ESCROW_FUNDED: 'escrow_funded',
  PAID: 'paid',
  REFUNDED: 'refunded',
};

// Order Status
export const ORDER_STATUS = {
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Logistics Status
export const LOGISTICS_STATUS = {
  ASSIGNED: 'assigned',
  PICKUP_SCHEDULED: 'pickup_scheduled',
  IN_TRANSIT: 'in_transit',
  DELAYED: 'delayed',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
};

// Pest Severity Levels
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Pest Report Status
export const PEST_REPORT_STATUS = {
  OPEN: 'open',
  VERIFIED: 'verified',
  TREATMENT_IN_PROGRESS: 'treatment_in_progress',
  RESOLVED: 'resolved',
};

// Loan Purposes
export const LOAN_PURPOSES = {
  SEEDS_AND_FERTILIZERS: 'seeds_and_fertilizers',
  FARM_MACHINERY: 'farm_machinery_equipment',
  IRRIGATION: 'irrigation_infrastructure',
  WAREHOUSE_RECEIPT: 'warehouse_receipt_advance',
  LAND_DEVELOPMENT: 'land_development',
  WORKING_CAPITAL: 'working_capital',
};

// Loan Status
export const LOAN_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed',
  REPAID: 'repaid',
  DEFAULTED: 'defaulted',
};

// Insurance Loss Causes
export const LOSS_CAUSES = {
  DROUGHT: 'drought',
  EXCESS_RAINFALL: 'excess_rainfall_flood',
  UNSEASONAL_RAIN: 'unseasonal_rain',
  PEST_INFESTATION: 'pest_infestation',
  HAILSTORM: 'hailstorm',
  FIRE_LIGHTNING: 'fire_lightning',
  CYCLONE: 'cyclone_storm',
};

// Insurance Claim Status
export const CLAIM_STATUS = {
  SUBMITTED: 'submitted',
  UNDER_INVESTIGATION: 'under_investigation',
  FIELD_ASSESSED: 'field_assessed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SETTLED: 'settled',
};

// Notification Categories
export const NOTIFICATION_CATEGORIES = {
  ORDER: 'order',
  WEATHER_ALERT: 'weather_alert',
  PEST_ALERT: 'pest_alert',
  MANDI_PRICE: 'mandi_price',
  LOAN: 'loan',
  INSURANCE: 'insurance',
  SYSTEM: 'system',
};

// Notification Priorities
export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

// Storage Buckets (matches Supabase storage config)
export const STORAGE_BUCKETS = {
  CROP_IMAGES: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STORAGE_CROP_IMAGES_BUCKET) || 'crop-images',
  DOCUMENTS: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STORAGE_DOCUMENTS_BUCKET) || 'documents',
  ML_MODELS: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STORAGE_ML_MODELS_BUCKET) || 'ml-models',
};

// Official Central Government Minimum Support Prices (MSP) in ₹/kg (CACP / CCEA 2026-27)
// 1 quintal = 100 kg. Mandated statutory safety net under NMEO-OP (A2+FL + 50% formula).
export const OILSEED_MSP_PER_KG = {
  mustard: 62.50,
  rapeseed: 62.50,
  groundnut: 71.50,
  soybean: 51.80,
  sunflower: 76.50,
  sesame: 98.00,
  safflower: 61.50,
  niger: 92.50,
  castor: 63.50,
};

export const OILSEED_MSP_METADATA = {
  mustard:   { msp: 62.50, msp_per_kg: 62.50, perQuintal: 6250, msp_per_quintal: 6250, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 200, season: 'Rabi 2026-27' },
  rapeseed:  { msp: 62.50, msp_per_kg: 62.50, perQuintal: 6250, msp_per_quintal: 6250, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 200, season: 'Rabi 2026-27' },
  groundnut: { msp: 71.50, msp_per_kg: 71.50, perQuintal: 7150, msp_per_quintal: 7150, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 220, season: 'Kharif 2026-27' },
  soybean:   { msp: 51.80, msp_per_kg: 51.80, perQuintal: 5180, msp_per_quintal: 5180, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 180, season: 'Kharif 2026-27' },
  sunflower: { msp: 76.50, msp_per_kg: 76.50, perQuintal: 7650, msp_per_quintal: 7650, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 220, season: 'Kharif 2026-27' },
  sesame:    { msp: 98.00, msp_per_kg: 98.00, perQuintal: 9800, msp_per_quintal: 9800, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 300, season: 'Kharif 2026-27' },
  safflower: { msp: 61.50, msp_per_kg: 61.50, perQuintal: 6150, msp_per_quintal: 6150, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 200, season: 'Rabi 2026-27' },
  niger:     { msp: 92.50, msp_per_kg: 92.50, perQuintal: 9250, msp_per_quintal: 9250, label: 'Official CACP/CCEA MSP 2026-27', isOfficialMsp: true, maxSanity: 250, season: 'Kharif 2026-27' },
  castor:    { msp: 63.50, msp_per_kg: 63.50, perQuintal: 6350, msp_per_quintal: 6350, label: 'National Mandi Benchmark Rate', isOfficialMsp: false, maxSanity: 200, season: 'Kharif 2026-27' },
  linseed:   { msp: 58.00, msp_per_kg: 58.00, perQuintal: 5800, msp_per_quintal: 5800, label: 'National Mandi Benchmark Rate', isOfficialMsp: false, maxSanity: 200, season: 'Rabi 2026-27' },
};

export function getOilseedReferencePrice(cropType) {
  const fallback = {
    msp: 60.00,
    msp_per_kg: 60.00,
    perQuintal: 6000,
    msp_per_quintal: 6000,
    label: 'Standard Market Reference',
    isOfficialMsp: false,
    maxSanity: 250,
    season: 'Current Marketing Season',
  };
  if (!cropType) return fallback;
  const key = String(cropType).toLowerCase().trim();
  const meta = OILSEED_MSP_METADATA[key];
  if (meta) {
    const msp = Number(meta.msp || 60.00);
    const quintal = Number(meta.perQuintal || msp * 100);
    return {
      ...meta,
      msp,
      msp_per_kg: msp,
      perQuintal: quintal,
      msp_per_quintal: quintal,
      season: meta.season || 'Current Marketing Season',
      maxSanity: Number(meta.maxSanity || 250),
    };
  }
  const num = Number(OILSEED_MSP_PER_KG[key] || 60.00);
  return {
    msp: num,
    msp_per_kg: num,
    perQuintal: Math.round(num * 100),
    msp_per_quintal: Math.round(num * 100),
    label: 'Standard Market Reference',
    isOfficialMsp: false,
    maxSanity: 250,
    season: 'Current Marketing Season',
  };
}

