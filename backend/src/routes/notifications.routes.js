// src/routes/notifications.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listNotifications, markRead, markAllRead,
  createNotification, deleteNotification,
  getPriceAlerts, cleanupPriceAlerts,
} from '../controllers/notifications.controller.js';

const router = Router();
router.use(authenticate);

// Dedicated price alerts endpoints
router.get('/price-alerts', getPriceAlerts);
router.delete('/price-alerts/cleanup', cleanupPriceAlerts);

router.get('/', listNotifications);
router.patch('/mark-all-read', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/:id', deleteNotification);

// Authenticated users (admin, fpo, government, farmer, etc.) can create/dispatch notifications
router.post('/', createNotification);

export default router;
