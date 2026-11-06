// backend/src/routes/schemeCatalog.routes.js
// Routes for Scheme Catalog (browse, query, sync, admin management, and promotion).

import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listCatalog,
  getCatalogItem,
  getSyncStatus,
  syncCatalog,
  createManualScheme,
  updateManualScheme,
  verifyCatalogScheme,
  promoteCatalogScheme,
} from '../controllers/schemeCatalog.controller.js';

const router = Router();

// All catalog routes require authentication
router.use(authenticate);

// ── Browse & Read Endpoints (All roles) ──────────────────────────────────────
router.get('/',
  requireRole('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'),
  listCatalog
);

router.get('/sync/status',
  requireRole('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'),
  getSyncStatus
);

router.get('/:id',
  requireRole('farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'),
  getCatalogItem
);

// ── Admin & Governance Operations ───────────────────────────────────────────
router.post('/sync',
  requireRole('admin', 'government'),
  syncCatalog
);

router.post('/',
  requireRole('admin', 'government'),
  createManualScheme
);

router.patch('/:id',
  requireRole('admin', 'government'),
  updateManualScheme
);

router.post('/:id/verify',
  requireRole('admin', 'government'),
  verifyCatalogScheme
);

router.post('/:id/promote',
  requireRole('admin', 'government'),
  promoteCatalogScheme
);

export default router;
