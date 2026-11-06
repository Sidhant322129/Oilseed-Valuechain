// src/routes/blockchain.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  getBlockchainStatus,
  registerBatch,
  transferOwnership,
  pinCertificate,
  getProvenance
} from '../controllers/blockchain.controller.js';

const router = Router();

// Public provenance verification endpoints (e.g. for QR code scanners)
router.get('/status', getBlockchainStatus);
router.get('/provenance/:batch_id', getProvenance);

// Authenticated & role-gated state modification endpoints
router.use(authenticate);

router.post('/register-batch', requireRole('farmer', 'fpo', 'processor', 'admin'), registerBatch);
router.post('/transfer-ownership', requireRole('retailer', 'processor', 'admin'), transferOwnership);
router.post('/pin-certificate', requireRole('fpo', 'processor', 'admin'), pinCertificate);

export default router;
