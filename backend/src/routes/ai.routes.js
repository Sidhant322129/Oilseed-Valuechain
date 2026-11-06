// src/routes/ai.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { predictPrice, detectPest, forecastDemand, getRiskScore } from '../controllers/ai.controller.js';

const router = Router();
router.use(authenticate);

router.post('/predict-price', requireRole('farmer', 'fpo', 'government', 'admin'), predictPrice);
router.post('/detect-pest', requireRole('farmer', 'fpo', 'admin'), detectPest);
router.post('/forecast-demand', requireRole('farmer', 'fpo', 'government', 'admin'), forecastDemand);
router.post('/risk-score', requireRole('government', 'admin'), getRiskScore);

export default router;
