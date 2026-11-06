// backend/src/routes/schemes.routes.js
// NEW FILE — does not modify any existing route file.
// Mounts all scheme catalogue + application + disbursement + audit endpoints.

import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listSchemes,
  getScheme,
  getSchemeEligibility,
  createApplication,
  bulkScreenApplications,
  listApplications,
  transitionApplication,
  createDisbursement,
  bulkCreateDisbursement,
  listAuditLogs,
} from '../controllers/schemes.controller.js';

const router = Router();

// All scheme routes require authentication
router.use(authenticate);

// ── Scheme Catalogue ─────────────────────────────────────────────────────────
// Any authenticated role can view the scheme catalogue
router.get('/',
  requireRole('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'),
  listSchemes
);

router.get('/:id',
  requireRole('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'),
  getScheme
);

// Eligibility evaluation — government + admin only
router.get('/:id/eligibility',
  requireRole('government', 'admin'),
  getSchemeEligibility
);

// ── Applications ──────────────────────────────────────────────────────────────
router.post('/applications',
  requireRole('government', 'admin', 'farmer', 'fpo'),
  createApplication
);

router.post('/applications/bulk-screen',
  requireRole('government', 'admin'),
  bulkScreenApplications
);

router.get('/applications/list',
  requireRole('government', 'admin', 'farmer', 'fpo'),
  listApplications
);

router.post('/applications/:id/transition',
  requireRole('government', 'admin', 'fpo'),
  transitionApplication
);

// ── Disbursements ─────────────────────────────────────────────────────────────
router.post('/disbursements',
  requireRole('government', 'admin'),
  createDisbursement
);

router.post('/disbursements/bulk',
  requireRole('government', 'admin'),
  bulkCreateDisbursement
);

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs',
  requireRole('government', 'admin'),
  listAuditLogs
);

export default router;
