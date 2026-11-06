import { adminClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';
import { generateLoanSanctionPdf } from '../services/pdf.service.js';
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

// ─── LOAN APPLICATIONS ────────────────────────────────────────────────────────

// GET /api/finance/loans
export async function listLoans(req, res, next) {
  try {
    const { id: userId, role } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('loan_applications')
      .select('*, farmers!inner(user_id, district, state, users!inner(full_name, email))')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (role === 'farmer') query = query.eq('farmers.user_id', userId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ loans: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/finance/loans
export async function applyForLoan(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    let { farmer_id, amount_requested, tenure_months, purpose, institution_name } = req.body;

    // Normalize purpose to match PostgreSQL loan_purpose_enum
    const PURPOSE_MAP = {
      crop_input: 'seeds_and_fertilizers',
      equipment: 'farm_machinery_equipment',
      storage: 'warehouse_receipt_advance',
      other: 'working_capital',
    };
    if (PURPOSE_MAP[purpose]) {
      purpose = PURPOSE_MAP[purpose];
    }

    const application_number = `LOAN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const creditScore = Math.floor(720 + Math.random() * 85);

    const { data, error } = await adminClient
      .from('loan_applications')
      .insert({
        application_number,
        farmer_id,
        amount_requested,
        approved_amount: amount_requested,
        interest_rate_annual: 4.0,
        tenure_months,
        purpose,
        institution_name: institution_name || 'State Bank of India (KCC Agri Loan)',
        status: 'under_review',
        ai_credit_score: creditScore,
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    // Create in-app notification for the farmer
    try {
      const { data: farmerRow } = await adminClient.from('farmers').select('user_id').eq('id', farmer_id).maybeSingle();
      if (farmerRow?.user_id) {
        await sendNotification({
          user_id: farmerRow.user_id,
          title: `Loan Application Under Review — ₹${Number(amount_requested).toLocaleString('en-IN')}`,
          message: `Your loan application ${application_number} has been submitted to ${institution_name || 'State Bank of India (KCC Agri Loan)'} and is under review.`,
          category: 'loan',
          priority: 'normal',
          action_url: '/dashboard/farmer',
          metadata: { loan_id: data.id, application_number, status: 'under_review' },
        });
      }
    } catch (notifErr) {
      console.warn('Failed to insert loan notification:', notifErr.message);
    }

    return res.status(201).json({
      message: 'Loan application submitted successfully. Application is under review.',
      loan: data,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/finance/loans/:id
export async function getLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await adminClient
      .from('loan_applications')
      .select('*, farmers(*, users(full_name, email))')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) return res.status(404).json({ error: { message: 'Loan application not found.', code: 'NOT_FOUND' } });

    return res.status(200).json({ loan: data });
  } catch (err) {
    next(err);
  }
}

// GET /api/finance/loans/:id/document
export async function downloadLoanDocument(req, res, next) {
  try {
    const { id } = req.params;
    const { data: loan, error } = await adminClient
      .from('loan_applications')
      .select('*, farmers(*, users(full_name, email))')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!loan) return res.status(404).json({ error: { message: 'Loan application not found.', code: 'NOT_FOUND' } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Loan-Sanction-${loan.application_number || loan.id.slice(0, 8)}.pdf`);

    generateLoanSanctionPdf(loan, res);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/finance/loans/:id/status — government/admin updates loan status
export async function updateLoanStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, approved_amount, interest_rate_annual, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: { message: 'status is required.', code: 'MISSING_FIELDS' } });
    }

    const updates = { status, updated_at: new Date().toISOString() };
    if (approved_amount !== undefined) updates.approved_amount = approved_amount;
    if (interest_rate_annual !== undefined) updates.interest_rate_annual = interest_rate_annual;

    const { data, error } = await adminClient
      .from('loan_applications')
      .update(updates)
      .eq('id', id)
      .select('*, farmers(user_id)')
      .single();

    if (error) return next(createError(error.message, 500, 'DB_UPDATE_ERROR'));

    // Dispatch notification to applicant farmer
    try {
      const applicantUid = data?.farmers?.user_id;
      if (applicantUid) {
        const appNum = data.application_number || id.slice(0, 8);
        const appAmt = data.approved_amount || data.amount_requested;
        let notifTitle = `Loan Application Update: ${appNum}`;
        let notifMsg = `Your loan application status has been updated to ${status}.`;
        let notifPriority = 'normal';

        if (status === 'approved') {
          notifTitle = `Loan Sanction Approved — ₹${Number(appAmt).toLocaleString('en-IN')}`;
          notifMsg = `Congratulations! Your credit application ${appNum} has been sanctioned by ${data.institution_name || 'the financing partner'}.`;
          notifPriority = 'high';
        } else if (status === 'disbursed') {
          notifTitle = `Loan Disbursed — ₹${Number(appAmt).toLocaleString('en-IN')}`;
          notifMsg = `Sanctioned loan funds of ₹${Number(appAmt).toLocaleString('en-IN')} for application ${appNum} have been transferred to your account.`;
          notifPriority = 'urgent';
        } else if (status === 'rejected') {
          notifTitle = `Loan Application Decision: ${appNum}`;
          notifMsg = `Your loan application ${appNum} was reviewed and could not be approved at this time. Notes: ${notes || 'Criteria not met.'}`;
          notifPriority = 'high';
        }

        await sendNotification({
          user_id: applicantUid,
          title: notifTitle,
          message: notifMsg,
          category: 'loan',
          priority: notifPriority,
          action_url: '/dashboard/farmer',
          metadata: { loan_id: id, application_number: appNum, status, notes: notes || null },
        });
      }
    } catch (notifErr) {
      console.warn('[updateLoanStatus] Notification error:', notifErr.message);
    }

    return res.status(200).json({ message: 'Loan status updated.', loan: data });
  } catch (err) {
    next(err);
  }
}

// ─── INSURANCE CLAIMS ────────────────────────────────────────────────────────

// GET /api/finance/insurance
export async function listInsuranceClaims(req, res, next) {
  try {
    const { id: userId, role } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('insurance_claims')
      .select('*, farmers!inner(user_id, users!inner(full_name)), crops(crop_type, variety)')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (role === 'farmer') query = query.eq('farmers.user_id', userId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ claims: data });
  } catch (err) {
    next(err);
  }
}

// POST /api/finance/insurance
export async function fileInsuranceClaim(req, res, next) {
  try {
    const {
      farmer_id, crop_id, policy_number, insurance_provider,
      claim_amount, cause_of_loss, loss_percentage, damage_evidence_urls,
    } = req.body;

    if (!farmer_id || !crop_id || !policy_number || !claim_amount || !cause_of_loss || !loss_percentage) {
      return res.status(400).json({ error: { message: 'Required fields missing.', code: 'MISSING_FIELDS' } });
    }

    const claim_number = `CLM-PMFBY-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const { data, error } = await adminClient
      .from('insurance_claims')
      .insert({
        claim_number, farmer_id, crop_id, policy_number, insurance_provider,
        claim_amount, cause_of_loss, loss_percentage,
        damage_evidence_urls: damage_evidence_urls || [],
        status: 'submitted',
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    // Dispatch notification to farmer
    try {
      const { data: farmerRow } = await adminClient.from('farmers').select('user_id').eq('id', farmer_id).maybeSingle();
      if (farmerRow?.user_id) {
        await sendNotification({
          user_id: farmerRow.user_id,
          title: `Insurance Claim Submitted: ${claim_number}`,
          message: `Your PMFBY insurance claim for ₹${Number(claim_amount).toLocaleString('en-IN')} (Policy ${policy_number}) has been registered and is pending assessment.`,
          category: 'insurance',
          priority: 'normal',
          action_url: '/dashboard/farmer',
          metadata: { claim_id: data.id, claim_number, policy_number, status: 'submitted' },
        });
      }
    } catch (notifErr) {
      console.warn('[fileInsuranceClaim] Notification error:', notifErr.message);
    }

    return res.status(201).json({ message: 'Insurance claim filed successfully.', claim: data });
  } catch (err) {
    next(err);
  }
}
