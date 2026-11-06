// src/routes/logistics.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { listLogistics, getLogisticsEntry, createLogistics, updateLogisticsStatus } from '../controllers/logistics.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('processor', 'retailer', 'fpo', 'admin'), listLogistics);
router.get('/:id', requireRole('processor', 'retailer', 'admin'), getLogisticsEntry);
router.post('/', requireRole('processor', 'admin'), createLogistics);
router.patch('/:id/status', requireRole('processor', 'admin'), updateLogisticsStatus);

export default router;
