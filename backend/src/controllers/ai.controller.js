// src/controllers/ai.controller.js
// AI microservice integration controller (Weeks 5-6).
// Routes are auth + role gated via ai.routes.js.

import { createError } from '../middleware/errorHandler.js';
import { getPricePrediction, getDemandForecast, getDirectPestDetection } from '../services/ai.service.js';
import { sendPestAlertSMS } from '../services/sms.service.js';
import { sendNotification } from '../services/notification.service.js';
import { adminClient } from '../config/supabaseClient.js';

const configuredPestAlertThreshold = Number(process.env.PEST_ALERT_RISK_THRESHOLD);
const pestAlertRiskThreshold = Number.isFinite(configuredPestAlertThreshold)
  ? configuredPestAlertThreshold
  : 60;

// POST /api/ai/predict-price
// Week 5: Random Forest regression with 7/14/30-day lag and harvest cycle features
export async function predictPrice(req, res, next) {
  try {
    const { crop_type, district, state, forecast_days = 7 } = req.body;

    if (!crop_type) {
      return res.status(400).json({
        error: { message: 'crop_type is required (e.g., mustard, soybean, groundnut).', code: 'MISSING_FIELDS' },
      });
    }

    const forecastDaysNum = Number(forecast_days) || 7;
    const result = await getPricePrediction({
      crop_type,
      district,
      state,
      forecast_days: forecastDaysNum,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/ai/detect-pest
// Calls Flask CNN to classify soyabean leaf pathology, persists report & sends SMS alert
export async function detectPest(req, res, next) {
  try {
    const { image_url, farmer_id, crop_id, crop_type } = req.body;

    if (!image_url || !farmer_id) {
      return res.status(400).json({
        error: { message: 'image_url and farmer_id are required.', code: 'MISSING_FIELDS' },
      });
    }

    // Resolve crop type
    let resolvedCropType = crop_type || null;
    if (!resolvedCropType && crop_id) {
      try {
        const { data: cropData } = await adminClient
          .from('crops')
          .select('crop_type')
          .eq('id', crop_id)
          .maybeSingle();
        if (cropData?.crop_type) resolvedCropType = cropData.crop_type;
      } catch (_) {}
    }

    const diagnosis = await getDirectPestDetection({ imageUrl: image_url, cropType: resolvedCropType });

    // 2. Fetch Farmer details to get contact phone if not in body
    let farmerQuery = await adminClient
      .from('farmers')
      .select('id, user_id, users(phone_number)')
      .eq('id', farmer_id)
      .maybeSingle();
    if (!farmerQuery.data) {
      farmerQuery = await adminClient
        .from('farmers')
        .select('id, user_id, users(phone_number)')
        .eq('user_id', farmer_id)
        .maybeSingle();
    }
    const farmerRow = farmerQuery.data;
    if (!farmerRow) {
      return res.status(404).json({
        error: { message: 'Farmer profile was not found.', code: 'FARMER_NOT_FOUND' },
      });
    }
    const farmerPhone = farmerRow.users?.phone_number || null;
    const farmerUserId = farmerRow.user_id;

    const riskScore = Number(diagnosis.confidence_score);
    const isHighRisk = Number.isFinite(riskScore) && riskScore >= pestAlertRiskThreshold;
    let smsResult = { attempted: false, success: false, simulated: false };

    // 3. Trigger Fast2SMS Alert if high risk
    if (isHighRisk && farmerPhone) {
      const smsRes = await sendPestAlertSMS({
        phoneNumber: farmerPhone,
        diseaseName: diagnosis.display_name || diagnosis.primary_diagnosis,
        confidenceScore: diagnosis.confidence_score,
        treatment: diagnosis.recommended_treatment,
        riskLevel: diagnosis.risk_level,
      });
      smsResult = { ...smsRes, attempted: true };
    }

    // 4. Save Pest Report into Supabase DB
    let pestReportId = null;
    try {
      const { data: reportData, error: dbErr } = await adminClient
        .from('pest_reports')
        .insert({
          farmer_id: farmerRow.id,
          crop_id: crop_id || null,
          image_url: image_url,
          detected_pest_or_disease: diagnosis.primary_diagnosis,
          ai_confidence_score: riskScore / 100,
          severity_level: diagnosis.risk_level?.toLowerCase() || 'medium',
          recommended_treatment: diagnosis.recommended_treatment,
          organic_remedy: diagnosis.recommended_treatment,
          chemical_remedy: diagnosis.chemical_treatment,
          expert_notes: diagnosis.cultural_treatment,
        })
        .select('id')
        .maybeSingle();

      if (!dbErr && reportData) {
        pestReportId = reportData.id;
      }
    } catch (insertErr) {
      console.warn('[ai.controller] Non-fatal pest_reports insert error:', insertErr.message);
    }

    // 5. Dispatch platform notification
    try {
      if (farmerUserId) {
        await sendNotification({
          user_id: farmerUserId,
          title: `⚠️ Pest Diagnosis Alert: ${diagnosis.display_name || diagnosis.primary_diagnosis}`,
          message: `Detected with ${diagnosis.confidence_score}% confidence. Recommended action: ${diagnosis.recommended_treatment}`,
          category: 'pest_alert',
          priority: isHighRisk ? 'urgent' : 'normal',
          metadata: {
            pest_report_id: pestReportId,
            diagnosis,
            sms_alert_sent: Boolean(smsResult.success && !smsResult.simulated),
          },
        });
      }
    } catch (notifErr) {
      console.warn('[ai.controller] Non-fatal notification error:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        ...diagnosis,
        pest_report_id: pestReportId,
        risk_threshold: pestAlertRiskThreshold,
        sms_alert_attempted: smsResult.attempted,
        sms_alert_sent: Boolean(smsResult.success && !smsResult.simulated),
        sms_alert_simulated: Boolean(smsResult.simulated),
        phone_contact: farmerPhone ? `${farmerPhone.slice(0, 3)}****${farmerPhone.slice(-3)}` : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/ai/forecast-demand
// Week 5: Statsmodels seasonal decomposition + linear trend
export async function forecastDemand(req, res, next) {
  try {
    const { crop_type, region = 'all', forecast_months = 3 } = req.body;

    if (!crop_type) {
      return res.status(400).json({
        error: { message: 'crop_type is required (e.g., mustard, soybean, groundnut).', code: 'MISSING_FIELDS' },
      });
    }

    const forecastMonthsNum = Number(forecast_months) || 3;
    const result = await getDemandForecast({
      crop_type,
      region,
      forecast_months: forecastMonthsNum,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/ai/risk-score
// Will call Flask risk scoring model for loan/insurance underwriting (Week 6)
export async function getRiskScore(req, res) {
  const { farmer_id } = req.body;

  if (!farmer_id) {
    return res.status(400).json({
      error: { message: 'farmer_id is required.', code: 'MISSING_FIELDS' },
    });
  }

  return res.status(501).json({
    message: 'AI credit/insurance risk scoring is pending (Week 6).',
    code: 'INTEGRATION_PENDING',
    contract: {
      endpoint: 'POST /api/ai/risk-score',
      description: 'Generates farmer credit risk score for loan and insurance underwriting.',
      request_body: { farmer_id: 'uuid' },
      expected_response_when_live: {
        risk_score: 'number — 300 to 900',
        risk_category: 'string — low / medium / high',
        factors: 'object — contributing risk factors',
      },
    },
  });
}
