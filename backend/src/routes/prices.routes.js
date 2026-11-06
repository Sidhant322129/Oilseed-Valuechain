// backend/src/routes/prices.routes.js
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { listPrices, recordPrice, evaluateLatestPriceAlert, ingestAgmarknetPrices, getMspPrices, syncMspPrices } from '../controllers/prices.controller.js';

const router = Router();

// MSP endpoint is public/authenticated so dashboards can dynamically read official rates
router.get('/msp', getMspPrices);

// Price viewing is accessible to any authenticated user (farmers, FPOs, processors, admin, government)
router.use(authenticate);

router.get('/', listPrices);
router.post('/', recordPrice);
router.post('/evaluate-alerts', evaluateLatestPriceAlert);

// POST /api/prices/ingest — admin or government officers only
router.post('/ingest', requireRole(['admin', 'government']), ingestAgmarknetPrices);

// POST /api/prices/msp/sync — sync MSP from data.gov.in (admin / government)
router.post('/msp/sync', requireRole(['admin', 'government']), syncMspPrices);

export default router;
