// src/routes/admin.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listUsers, updateUserRole, verifyUser, deleteUser,
  getPlatformStats, broadcastNotification, getAuditLogs,
  listProcurementBids, forceCancelProcurementBid,
} from '../controllers/admin.controller.js';
import {
  getOverview,
  listBids,
  getBidDetail,
  getAuditLog,
  exportAuditLogCsv,
  getFlags,
  reviewFlag,
  getAnalytics,
  adminFreezeBid,
  adminUnfreezeBid,
  adminForceCloseBid,
  adminVoidQuote,
  adminSuspendFpo,
  adminReinstateFpo,
} from '../controllers/bidMonitor.controller.js';

const router = Router();

// Every admin route requires authentication AND admin role
router.use(authenticate, requireRole('admin'));

router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/verify', verifyUser);
router.delete('/users/:id', deleteUser);
router.get('/stats', getPlatformStats);
router.get('/audit-logs', getAuditLogs);
router.post('/broadcast', broadcastNotification);
router.post('/notifications/broadcast', broadcastNotification);

// Procurement Bids Audit & Governance (Admin Oversight - Legacy & Compatibility)
router.get('/procurement-bids', listProcurementBids);
router.post('/procurement-bids/:id/cancel', forceCancelProcurementBid);

// ── Admin Bid Monitor Endpoints (/api/admin/procurement/*) ─────────────────────
router.get('/procurement/overview', getOverview);
router.get('/procurement/bids', listBids);
router.get('/procurement/bids/:id', getBidDetail);
router.get('/procurement/audit-log/export', exportAuditLogCsv);
router.get('/procurement/audit-log', getAuditLog);
router.get('/procurement/flags', getFlags);
router.patch('/procurement/flags/:id', reviewFlag);
router.post('/procurement/bids/:id/freeze', adminFreezeBid);
router.post('/procurement/bids/:id/unfreeze', adminUnfreezeBid);
router.post('/procurement/bids/:id/force-close', adminForceCloseBid);
router.post('/procurement/quotes/:id/void', adminVoidQuote);
router.post('/procurement/fpos/:id/suspend', adminSuspendFpo);
router.post('/procurement/fpos/:id/reinstate', adminReinstateFpo);
router.get('/procurement/analytics', getAnalytics);

export default router;
