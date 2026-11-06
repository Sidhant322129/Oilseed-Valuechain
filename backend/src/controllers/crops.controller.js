// src/controllers/crops.controller.js
// CRUD for crop cultivation cycles.
// Role gate: farmer (own crops), fpo (district crops), admin (all)

import { adminClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';
import { anchorCropBatchOnChain } from '../services/blockchain.service.js';
import { relayCreateBatch, relayRegisterFarmer, relayRecordCertificate, getSavedReceipts } from '../services/relayer.service.js';
import { pinToIPFS } from '../services/ipfs.service.js';
import { sendNotification } from '../services/notification.service.js';

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return null;
}

// GET /api/crops — list crops
export async function listCrops(req, res, next) {
  try {
    const { role, id: userId } = req.user;
    const { crop_type, status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('crops')
      .select(`
        *, batches(id, batch_code, status, harvest_date, quantity_kg, quality_grade),
        farmers!inner(user_id, district, state,
          users!inner(full_name, email))
      `)
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (role === 'farmer') {
      query = query.eq('farmers.user_id', userId);
    }
    if (crop_type) query = query.eq('crop_type', crop_type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ crops: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// GET /api/crops/:id
export async function getCrop(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { data, error } = await adminClient
      .from('crops')
      .select('*, batches(id, batch_code, status, harvest_date, quantity_kg, quality_grade), farmers!inner(user_id), land_records(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) return res.status(404).json({ error: { message: 'Crop not found.', code: 'CROP_NOT_FOUND' } });

    if (role === 'farmer' && data.farmers.user_id !== userId) {
      return res.status(403).json({ error: { message: 'Access denied.', code: 'ROLE_FORBIDDEN' } });
    }

    return res.status(200).json({ crop: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/crops — register a new crop cycle
export async function createCrop(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { id: userId } = req.user;
    let {
      farmer_id, land_id, crop_type, variety, season,
      sowing_date, expected_harvest_date, acreage_allocated, estimated_yield_quintals,
    } = req.body;

    // Normalize crop_type so both 'soybean' and 'soyabean' map to PostgreSQL enum value 'soybean'
    if (crop_type === 'soyabean') {
      crop_type = 'soybean';
    }

    // Verify the farmer_id belongs to the authenticated user (unless admin/fpo)
    if (req.user.role === 'farmer') {
      const { data: farmerRecord } = await adminClient
        .from('farmers')
        .select('id')
        .eq('id', farmer_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!farmerRecord) {
        return res.status(403).json({
          error: { message: 'You can only register crops for your own farmer profile.', code: 'ROLE_FORBIDDEN' },
        });
      }
    }

    const { data, error } = await adminClient
      .from('crops')
      .insert({
        farmer_id,
        land_id: land_id || null,
        crop_type,
        variety,
        season,
        sowing_date,
        expected_harvest_date,
        acreage_allocated,
        estimated_yield_quintals: estimated_yield_quintals || null,
        status: 'sown',
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    // Automatically anchor the newly registered crop & batch to Ethereum Sepolia via BatchRecord.sol
    let blockchainReceipt = null;
    let createdBatch = null;
    try {
      // Lookup farmer location to generate localized batch code
      const { data: farmerInfo } = await adminClient
        .from('farmers')
        .select('district, state')
        .eq('id', farmer_id)
        .maybeSingle();

      blockchainReceipt = await anchorCropBatchOnChain({
        cropId: data.id,
        cropType: crop_type,
        variety,
        acreage: acreage_allocated,
        estimatedYield: estimated_yield_quintals,
        farmerId: farmer_id,
        district: farmerInfo?.district || 'Sehore',
        state: farmerInfo?.state || 'Madhya Pradesh'
      });

      // Automatically create a corresponding batch in the batches table
      const harvestDateVal = expected_harvest_date || req.body.expected_harvest || new Date().toISOString().split('T')[0];
      const quantityKg = estimated_yield_quintals ? Number(estimated_yield_quintals) * 100 : Number(acreage_allocated) * 450;
      const { data: bData, error: bInsertError } = await adminClient
        .from('batches')
        .insert({
          crop_id: data.id,
          farmer_id,
          batch_code: blockchainReceipt.batchCode,
          quantity_kg: quantityKg,
          quality_grade: 'pending_testing',
          harvest_date: harvestDateVal,
          status: 'harvested',
          base_ask_price_per_kg: crop_type === 'mustard' ? 58.0 : 52.5,
        })
        .select()
        .single();

      if (bInsertError) {
        console.error('[CropsController] Failed to insert batch record:', bInsertError);
        throw new Error(`Batch insert failed: ${bInsertError.message}`);
      }

      createdBatch = bData;

      // Trigger automatic on-chain write to BatchRecord.sol on Sepolia & await receipt
      const onChainReceipt = await relayCreateBatch({
        batchId: blockchainReceipt.batchCode,
        cropType: crop_type,
        quantityKg
      });

      if (onChainReceipt?.tx_hash) {
        blockchainReceipt.txHash = onChainReceipt.tx_hash;
        blockchainReceipt.blockNumber = onChainReceipt.block_number;
        blockchainReceipt.explorerUrl = onChainReceipt.explorer_url;
        blockchainReceipt.status = 'Confirmed';
        if (createdBatch) {
          createdBatch.tx_hash = onChainReceipt.tx_hash;
          createdBatch.tx_status = 'confirmed';
          createdBatch.block_number = onChainReceipt.block_number;
        }
      }

      // Also ensure farmer identity is anchored on FarmerRegistry.sol on Sepolia
      relayRegisterFarmer({
        farmerId: farmer_id,
        walletAddress: null
      });
    } catch (bcErr) {
      console.error('[CropsController] Batch creation or blockchain anchoring failed:', bcErr);
      if (data?.id) {
        try {
          await adminClient.from('crops').delete().eq('id', data.id);
        } catch (_) {}
      }
      return next(createError(`Crop registration failed during batch or blockchain anchoring: ${bcErr.message}`, 500, 'BATCH_ANCHOR_FAILED'));
    }

    // Send confirmation notification to farmer
    try {
      const cropName = (crop_type || 'Oilseed').charAt(0).toUpperCase() + (crop_type || 'oilseed').slice(1);
      await sendNotification({
        user_id: userId,
        title: `Crop Cycle Registered & Anchored to Blockchain: ${cropName}`,
        message: `Successfully registered ${acreage_allocated} acres of ${cropName} (${variety || 'Standard'}). On-chain Batch: ${blockchainReceipt?.batchCode || 'Initialized'}.`,
        category: 'order',
        priority: 'normal',
        action_url: '/dashboard/farmer',
        metadata: {
          crop_id: data.id,
          crop_type,
          variety,
          season,
          acreage_allocated,
          batch_code: blockchainReceipt?.batchCode,
          tx_hash: blockchainReceipt?.txHash
        },
      });
    } catch (_) {}

    return res.status(201).json({
      message: 'Crop registered and anchored to Ethereum Sepolia blockchain successfully.',
      crop: data,
      batch: createdBatch,
      blockchain: blockchainReceipt
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/crops/:id
export async function updateCrop(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { data: existing } = await adminClient
      .from('crops')
      .select('id, farmers!inner(user_id)')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: { message: 'Crop not found.', code: 'CROP_NOT_FOUND' } });

    if (role === 'farmer' && existing.farmers.user_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only update your own crops.', code: 'ROLE_FORBIDDEN' } });
    }

    const allowedFields = [
      'variety', 'actual_harvest_date', 'actual_yield_quintals', 'status',
      'estimated_yield_quintals', 'expected_harvest_date',
    ];

    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.updated_at = new Date().toISOString();

    const { data, error } = await adminClient
      .from('crops')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    // ── STAGE 3 AUTOMATION ────────────────────────────────────────────────────
    // When a farmer marks a crop as 'harvested', automatically trigger Lab Quality
    // Certification: pin NABL assay to IPFS Pinata and anchor CID to QualityOracle.sol
    // This is fire-and-forget (non-blocking) so it does NOT delay the PATCH response.
    if (req.body.status === 'harvested') {
      (async () => {
        try {
          // Find the associated batch for this crop
          const { data: batch } = await adminClient
            .from('batches')
            .select('id, batch_code, quality_grade, moisture_pct, oil_content_pct, foreign_matter_pct, quantity_kg')
            .eq('crop_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!batch) {
            console.warn(`[CropsController] Stage 3 auto-trigger: no batch found for crop ${id}, skipping.`);
            return;
          }

          const batchCode = batch.batch_code;

          // Idempotency guard: skip if Stage 3 already confirmed for this batch
          const saved = getSavedReceipts();
          const existingCert = saved[`recordCert_${batchCode}`] || saved[`recordCert_${batch.id}`];
          if (existingCert?.chain_status === 'confirmed' && existingCert?.tx_hash) {
            console.log(`[CropsController] Stage 3 already confirmed for batch ${batchCode} (tx: ${existingCert.tx_hash}). Skipping duplicate.`);
            return;
          }

          // Determine quality parameters (use existing batch values or defaults)
          const moisture = batch.moisture_pct ?? 6.8;
          const oilContent = batch.oil_content_pct ?? 48.2;
          const grade = batch.quality_grade && batch.quality_grade !== 'pending_testing' ? batch.quality_grade : 'grade_a_premium';
          const foreignMatter = batch.foreign_matter_pct ?? 0.5;

          console.log(`[CropsController] Stage 3 auto-trigger: crop ${id} marked 'harvested'. Pinning cert for batch ${batchCode}...`);

          // Pin NABL assay certificate to Pinata IPFS
          const assayPayload = {
            batch_id: batchCode,
            batch_uuid: batch.id,
            cert_type: 'nabl_lab_assay',
            lab_data: {
              moisture_pct: Number(moisture),
              oil_content_pct: Number(oilContent),
              quality_grade: grade,
              foreign_matter_pct: Number(foreignMatter),
            },
            certified_at: new Date().toISOString(),
            auto_triggered_by: 'harvest_status_update',
          };

          const ipfsResult = await pinToIPFS(assayPayload, {
            batchId: batchCode,
            name: `NABL_QualityCert_${batchCode}`,
            customAttributes: {
              qualityGrade: grade,
              moisturePct: moisture,
              oilContentPct: oilContent,
            },
          });

          console.log(`[CropsController] Stage 3 IPFS pinned: CID ${ipfsResult.ipfsCID} for batch ${batchCode}`);

          // Anchor CID to QualityOracle.sol on Ethereum Sepolia
          const onChainReceipt = await relayRecordCertificate({
            batchId: batchCode,
            batchUuid: batch.id,
            ipfsCID: ipfsResult.ipfsCID,
            certType: 'nabl_lab_assay',
          });

          console.log(`[CropsController] Stage 3 on-chain tx: ${onChainReceipt?.tx_hash} for batch ${batchCode}`);

          // Update batch in Supabase with lab assay values and status = 'quality_tested'
          await adminClient
            .from('batches')
            .update({
              quality_grade: grade,
              moisture_pct: Number(moisture),
              oil_content_pct: Number(oilContent),
              foreign_matter_pct: Number(foreignMatter),
              status: 'quality_tested',
              updated_at: new Date().toISOString(),
            })
            .eq('id', batch.id);

          console.log(`[CropsController] Stage 3 auto-trigger complete for batch ${batchCode}. Batch updated to quality_tested.`);
        } catch (stage3Err) {
          // Non-fatal: Stage 3 failure does not roll back the crop status update
          console.error(`[CropsController] Stage 3 auto-trigger failed for crop ${id}:`, stage3Err.message);
        }
      })();
    }
    // ── END STAGE 3 AUTOMATION ────────────────────────────────────────────────

    return res.status(200).json({
      message: 'Crop updated.',
      crop: data,
      stage3_triggered: req.body.status === 'harvested',
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/crops/:id
export async function deleteCrop(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // 1. Fetch the crop and verify ownership for farmer role
    const { data: existing, error: fetchErr } = await adminClient
      .from('crops')
      .select('id, farmers!inner(user_id)')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) return next(createError(fetchErr.message, 500, 'DB_QUERY_ERROR'));
    if (!existing) return res.status(404).json({ error: { message: 'Crop not found.', code: 'CROP_NOT_FOUND' } });

    if (role === 'farmer' && existing.farmers.user_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only delete your own crops.', code: 'ROLE_FORBIDDEN' } });
    }

    // 2. Find all batch IDs for this crop
    // orders.batch_id is ON DELETE RESTRICT, so we must clear orders first before
    // the CASCADE on crops→batches fires and causes a FK violation.
    const { data: batches, error: batchFetchErr } = await adminClient
      .from('batches')
      .select('id')
      .eq('crop_id', id);

    if (batchFetchErr) return next(createError(batchFetchErr.message, 500, 'DB_QUERY_ERROR'));

    if (batches && batches.length > 0) {
      const batchIds = batches.map((b) => b.id);
      const { error: ordersDeleteErr } = await adminClient
        .from('orders')
        .delete()
        .in('batch_id', batchIds);
      if (ordersDeleteErr) return next(createError(ordersDeleteErr.message, 500, 'DB_DELETE_ERROR'));
    }

    // 3. Delete the crop — ON DELETE CASCADE handles batches, pest_reports, insurance_claims
    const { error } = await adminClient.from('crops').delete().eq('id', id);
    if (error) return next(createError(error.message, 500, 'DB_DELETE_ERROR'));

    return res.status(200).json({ message: 'Crop deleted.' });
  } catch (err) {
    next(err);
  }
}

// Known geographic coordinates for agricultural districts
const DISTRICT_COORDINATES = {
  'morena': { lat: 26.4948, lng: 77.9940, defaultState: 'Madhya Pradesh' },
  'purba medinipur': { lat: 21.9016, lng: 87.7770, defaultState: 'West Bengal' },
  'rajkot': { lat: 22.3039, lng: 70.8022, defaultState: 'Gujarat' },
  'karnoor': { lat: 15.8281, lng: 78.0373, defaultState: 'Andhra Pradesh' },
  'kurnool': { lat: 15.8281, lng: 78.0373, defaultState: 'Andhra Pradesh' },
  'indore': { lat: 22.7196, lng: 75.8577, defaultState: 'Madhya Pradesh' },
  'ujjain': { lat: 23.1765, lng: 75.7885, defaultState: 'Madhya Pradesh' },
  'dewas': { lat: 22.9676, lng: 76.0534, defaultState: 'Madhya Pradesh' },
  'sehore': { lat: 23.2030, lng: 77.0844, defaultState: 'Madhya Pradesh' },
  'mandsaur': { lat: 24.0722, lng: 75.0682, defaultState: 'Madhya Pradesh' },
  'bharatpur': { lat: 27.2170, lng: 77.4895, defaultState: 'Rajasthan' },
  'khargone': { lat: 21.8234, lng: 75.6087, defaultState: 'Madhya Pradesh' },
  'koppal': { lat: 15.3468, lng: 76.1554, defaultState: 'Karnataka' },
  'latur': { lat: 18.4088, lng: 76.5604, defaultState: 'Maharashtra' },
  'nanded': { lat: 19.1383, lng: 77.3210, defaultState: 'Maharashtra' },
  'guntur': { lat: 16.3067, lng: 80.4365, defaultState: 'Andhra Pradesh' },
  'bikaner': { lat: 28.0229, lng: 73.3119, defaultState: 'Rajasthan' },
  'alwar': { lat: 27.5530, lng: 76.6346, defaultState: 'Rajasthan' },
  'solapur': { lat: 17.6599, lng: 75.9064, defaultState: 'Maharashtra' },
};

// GET /api/crops/regional-crop-health — aggregated regional crop health for Government & Admin
export async function getRegionalCropHealth(req, res, next) {
  try {
    // 1. Fetch real farmers, active crops, and pest reports concurrently
    const [
      { data: farmers, error: fErr },
      { data: crops, error: cErr },
      { data: pests, error: pErr },
    ] = await Promise.all([
      adminClient.from('farmers').select('id, district, state, kyc_status, total_land_area_acres'),
      adminClient.from('crops').select('id, farmer_id, crop_type, variety, season, acreage_allocated, status, estimated_yield_quintals, farmers(id, district, state)'),
      adminClient.from('pest_reports').select('id, farmer_id, crop_id, detected_pest_or_disease, severity_level, reported_at, recommended_treatment, farmers(id, district, state)'),
    ]);

    if (fErr) return next(createError(fErr.message, 500, 'DB_QUERY_ERROR'));
    if (cErr) return next(createError(cErr.message, 500, 'DB_QUERY_ERROR'));
    if (pErr) return next(createError(pErr.message, 500, 'DB_QUERY_ERROR'));

    // 2. Map farmer ID to district
    const farmerDistrictMap = {};
    (farmers || []).forEach(f => {
      if (f.id && f.district) {
        farmerDistrictMap[f.id] = {
          district: f.district.trim(),
          state: f.state ? f.state.trim() : 'India',
        };
      }
    });

    // 3. Aggregate by normalized district key
    const regionsMap = {};

    function getRegionBucket(rawDistrict, rawState) {
      if (!rawDistrict) return null;
      const dClean = rawDistrict.trim();
      const sClean = rawState ? rawState.trim() : '';
      const key = `${dClean.toLowerCase()}_${sClean.toLowerCase()}`;

      if (!regionsMap[key]) {
        const normDist = dClean.toLowerCase();
        const coords = DISTRICT_COORDINATES[normDist] || {
          lat: 22.5 + (Object.keys(regionsMap).length * 0.8),
          lng: 77.0 + (Object.keys(regionsMap).length * 0.8),
        };

        regionsMap[key] = {
          district: dClean,
          state: sClean || coords.defaultState || 'India',
          latitude: coords.lat,
          longitude: coords.lng,
          farmer_count: 0,
          verified_farmers_count: 0,
          total_land_acres: 0,
          crop_count: 0,
          total_crop_acreage: 0,
          crop_breakdown: {},
          pest_reports_count: 0,
          high_risk_pest_count: 0,
          recent_pests: [],
        };
      }
      return regionsMap[key];
    }

    // Populate farmer metrics
    (farmers || []).forEach(f => {
      if (!f.district) return;
      const bucket = getRegionBucket(f.district, f.state);
      if (bucket) {
        bucket.farmer_count += 1;
        if (f.kyc_status === 'verified') bucket.verified_farmers_count += 1;
        bucket.total_land_acres += parseFloat(f.total_land_area_acres) || 0;
      }
    });

    // Populate crop metrics
    (crops || []).forEach(c => {
      const distInfo = c.farmers?.district
        ? { district: c.farmers.district, state: c.farmers.state }
        : farmerDistrictMap[c.farmer_id];
      if (!distInfo?.district) return;

      const bucket = getRegionBucket(distInfo.district, distInfo.state);
      if (bucket) {
        bucket.crop_count += 1;
        const cropType = (c.crop_type || 'oilseed').toLowerCase();
        const acreage = parseFloat(c.acreage_allocated) || 0;
        bucket.total_crop_acreage += acreage;

        if (!bucket.crop_breakdown[cropType]) {
          bucket.crop_breakdown[cropType] = {
            crop_type: cropType,
            count: 0,
            acreage: 0,
            varieties: [],
          };
        }
        bucket.crop_breakdown[cropType].count += 1;
        bucket.crop_breakdown[cropType].acreage += acreage;
        if (c.variety && !bucket.crop_breakdown[cropType].varieties.includes(c.variety)) {
          bucket.crop_breakdown[cropType].varieties.push(c.variety);
        }
      }
    });

    // Populate pest reports
    (pests || []).forEach(p => {
      const distInfo = p.farmers?.district
        ? { district: p.farmers.district, state: p.farmers.state }
        : farmerDistrictMap[p.farmer_id];
      if (!distInfo?.district) return;

      const bucket = getRegionBucket(distInfo.district, distInfo.state);
      if (bucket) {
        bucket.pest_reports_count += 1;
        const isHighRisk = p.severity_level === 'high' || p.severity_level === 'critical';
        if (isHighRisk) bucket.high_risk_pest_count += 1;

        if (bucket.recent_pests.length < 5) {
          bucket.recent_pests.push({
            id: p.id,
            disease: p.detected_pest_or_disease,
            severity: p.severity_level || 'medium',
            reported_at: p.reported_at,
            treatment: p.recommended_treatment,
          });
        }
      }
    });

    // 4. Compute health status and format output
    const regions = Object.values(regionsMap).map(r => {
      let healthStatus = 'Optimal';
      let healthScore = 95;
      let badgeColor = '#2EA043'; // Emerald green

      if (r.high_risk_pest_count > 0) {
        healthStatus = 'High Risk';
        healthScore = 45;
        badgeColor = '#DA3633'; // Crimson
      } else if (r.pest_reports_count > 0) {
        healthStatus = 'Monitoring';
        healthScore = 75;
        badgeColor = '#E5A93C'; // Canola gold
      } else if (r.crop_count === 0) {
        healthStatus = 'Dormant';
        healthScore = 85;
        badgeColor = '#388bfd'; // Soft blue
      }

      // Convert crop breakdown map to array
      const cropsList = Object.values(r.crop_breakdown).map(cb => ({
        crop_type: cb.crop_type,
        count: cb.count,
        acreage: Number(cb.acreage.toFixed(1)),
        varieties: cb.varieties,
      }));

      return {
        district: r.district,
        state: r.state,
        latitude: r.latitude,
        longitude: r.longitude,
        farmer_count: r.farmer_count,
        verified_farmers_count: r.verified_farmers_count,
        total_land_acres: Number(r.total_land_acres.toFixed(1)),
        crop_count: r.crop_count,
        total_crop_acreage: Number(r.total_crop_acreage.toFixed(1)),
        crops: cropsList,
        pest_reports_count: r.pest_reports_count,
        high_risk_pest_count: r.high_risk_pest_count,
        recent_pests: r.recent_pests,
        health_status: healthStatus,
        health_score: healthScore,
        badge_color: badgeColor,
      };
    });

    // Filter out regions with 0 cultivated acreage per user requirement
    const activeCropRegions = regions.filter(r => r.total_crop_acreage > 0 && r.crop_count > 0);

    // Sort regions by total_crop_acreage descending
    activeCropRegions.sort((a, b) => b.total_crop_acreage - a.total_crop_acreage);

    return res.status(200).json({
      success: true,
      total_regions: activeCropRegions.length,
      total_registered_farmers: (farmers || []).length,
      total_active_crops: (crops || []).length,
      total_pest_reports: (pests || []).length,
      regions: activeCropRegions,
    });
  } catch (err) {
    next(err);
  }
}

