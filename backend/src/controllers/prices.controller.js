// backend/src/controllers/prices.controller.js
// APMC Mandi Price Intelligence controller.
// Allows querying historical benchmarks and inserting new market prices,
// which triggers real-time price surge detection and farmer alerts.
// Also exposes /api/prices/ingest to trigger AGMARKNET data ingestion on-demand.

import { adminClient } from '../config/supabaseClient.js';
import { createError } from '../middleware/errorHandler.js';
import { checkAndCreatePriceAlert } from '../services/priceAlert.service.js';
import { runAgmarknetIngestion } from '../services/agmarknet.service.js';


/**
 * GET /api/prices — List price history records with filtering and pagination
 */
export async function listPrices(req, res, next) {
  try {
    const { crop_type, mandi_name, state, limit = 50, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('price_history')
      .select('*', { count: 'exact' })
      .order('price_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (crop_type) {
      query = query.eq('crop_type', crop_type.toLowerCase());
    }
    if (mandi_name) {
      query = query.ilike('mandi_name', `%${mandi_name}%`);
    }
    if (state) {
      query = query.ilike('state', `%${state}%`);
    }

    const { data, count, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({
      prices: data || [],
      totalCount: count || 0,
      meta: { page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/prices — Record a new APMC mandi price.
 * Immediately runs threshold-based price alert analysis and notifies relevant farmers.
 */
export async function recordPrice(req, res, next) {
  try {
    const {
      crop_type,
      variety,
      mandi_name,
      state,
      district,
      modal_price_per_quintal,
      min_price_per_quintal,
      max_price_per_quintal,
      arrival_quantity_tonnes = 0,
      price_date = new Date().toISOString().split('T')[0],
      source = 'Agmarknet API',
    } = req.body;

    if (!crop_type || !modal_price_per_quintal || !mandi_name || !state || !district) {
      return res.status(400).json({
        error: {
          message: 'crop_type, modal_price_per_quintal, mandi_name, state, and district are required.',
          code: 'MISSING_FIELDS',
        },
      });
    }

    const modalPrice = Number(modal_price_per_quintal);
    const minPrice = min_price_per_quintal ? Number(min_price_per_quintal) : Number((modalPrice * 0.95).toFixed(2));
    const maxPrice = max_price_per_quintal ? Number(max_price_per_quintal) : Number((modalPrice * 1.05).toFixed(2));

    if (modalPrice <= 0 || minPrice <= 0 || maxPrice < minPrice) {
      return res.status(400).json({
        error: {
          message: 'Invalid price range: modal and min must be > 0, and max must be >= min.',
          code: 'INVALID_PRICE_RANGE',
        },
      });
    }

    // Insert into price_history table
    const { data: priceRecord, error: insertErr } = await adminClient
      .from('price_history')
      .insert({
        crop_type: crop_type.toLowerCase(),
        variety: variety || null,
        mandi_name,
        state,
        district,
        modal_price_per_quintal: modalPrice,
        min_price_per_quintal: minPrice,
        max_price_per_quintal: maxPrice,
        arrival_quantity_tonnes: Number(arrival_quantity_tonnes) || 0,
        price_date,
        source,
      })
      .select()
      .single();

    if (insertErr) {
      return next(createError(insertErr.message, 500, 'DB_INSERT_ERROR'));
    }

    // Trigger price alert surge detection service
    const alertEvaluation = await checkAndCreatePriceAlert(priceRecord);

    return res.status(201).json({
      message: 'Mandi price recorded successfully.',
      price: priceRecord,
      alertEvaluation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/prices/evaluate-alerts — Manually evaluate the latest price record for a crop
 */
export async function evaluateLatestPriceAlert(req, res, next) {
  try {
    const { crop_type } = req.body;
    if (!crop_type) {
      return res.status(400).json({
        error: { message: 'crop_type is required.', code: 'MISSING_CROP_TYPE' },
      });
    }

    const { data: latestPrice, error } = await adminClient
      .from('price_history')
      .select('*')
      .eq('crop_type', crop_type.toLowerCase())
      .order('price_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!latestPrice) {
      return res.status(404).json({ error: { message: `No price records found for ${crop_type}.`, code: 'NOT_FOUND' } });
    }

    const result = await checkAndCreatePriceAlert(latestPrice);
    return res.status(200).json({ message: 'Evaluation completed.', result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/prices/ingest — Trigger AGMARKNET data ingestion on-demand.
 * Protected: admin/government roles only.
 * Also called internally by the node-cron scheduler every 6 hours.
 */
export async function ingestAgmarknetPrices(req, res, next) {
  try {
    console.log('[AGMARKNET] Manual ingestion triggered via API.');
    const result = await runAgmarknetIngestion();
    return res.status(200).json({
      message: 'AGMARKNET ingestion completed.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/prices/msp — Retrieve current automated MSP rates and metadata
 */
export async function getMspPrices(req, res, next) {
  try {
    const { getCurrentMspRates } = await import('../services/msp.service.js');
    const result = await getCurrentMspRates();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/prices/msp/sync — Trigger live sync from data.gov.in
 */
export async function syncMspPrices(req, res, next) {
  try {
    const { syncMspFromDataGov } = await import('../services/msp.service.js');
    const result = await syncMspFromDataGov();
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

