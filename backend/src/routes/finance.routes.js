// src/routes/finance.routes.js
import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listLoans, applyForLoan, getLoan, updateLoanStatus, downloadLoanDocument,
  listInsuranceClaims, fileInsuranceClaim,
} from '../controllers/finance.controller.js';

const router = Router();
router.use(authenticate);

const LOAN_PURPOSES = [
  'seeds_and_fertilizers',
  'farm_machinery_equipment',
  'irrigation_infrastructure',
  'warehouse_receipt_advance',
  'land_development',
  'working_capital',
  'crop_input',
  'equipment',
  'storage',
  'other',
];

// Loan routes
router.get('/loans', requireRole('farmer', 'government', 'admin'), listLoans);
router.get('/loans/:id/document', requireRole('farmer', 'government', 'admin'), downloadLoanDocument);
router.get('/loans/:id', requireRole('farmer', 'government', 'admin'), getLoan);
router.post(
  '/loans',
  requireRole('farmer'),
  [
    body('farmer_id').isUUID().withMessage('farmer_id must be a valid UUID.'),
    body('amount_requested').isFloat({ min: 1000 }).withMessage('amount_requested must be at least 1000.'),
    body('tenure_months').isInt({ min: 1 }).withMessage('tenure_months must be a positive integer.'),
    body('purpose').isIn(LOAN_PURPOSES).withMessage(`purpose must be one of: ${LOAN_PURPOSES.join(', ')}`),
  ],
  applyForLoan
);
router.patch('/loans/:id/status', requireRole('government', 'admin'), updateLoanStatus);

// Insurance routes
router.get('/insurance', requireRole('farmer', 'government', 'admin'), listInsuranceClaims);
router.post('/insurance', requireRole('farmer'), fileInsuranceClaim);

export default router;
