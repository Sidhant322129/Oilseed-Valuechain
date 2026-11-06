// src/routes/farmers.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { listFarmers, getFarmer, createFarmer, updateFarmer, deleteFarmer, registerMemberFarmer } from '../controllers/farmers.controller.js';

const router = Router();

// All farmer routes require authentication
router.use(authenticate);

// GET /api/farmers
router.get('/', requireRole('farmer', 'fpo', 'admin'), listFarmers);

// POST /api/farmers/member — FPO / Admin onboards member farmer into FPO collective
router.post(
  '/member',
  requireRole('fpo', 'admin'),
  [
    body('full_name').notEmpty().withMessage('full_name is required.'),
    body('email').isEmail().withMessage('Valid email is required.'),
    body('district').notEmpty().withMessage('district is required.'),
    body('state').notEmpty().withMessage('state is required.'),
  ],
  registerMemberFarmer
);

// GET /api/farmers/:id
router.get('/:id', [param('id').isUUID().withMessage('id must be a valid UUID.')], requireRole('farmer', 'fpo', 'admin'), getFarmer);

// POST /api/farmers
router.post(
  '/',
  requireRole('farmer', 'fpo', 'admin'),
  [
    body('state').notEmpty().withMessage('state is required.'),
    body('district').notEmpty().withMessage('district is required.'),
    body('village').notEmpty().withMessage('village is required.'),
    body('pincode').isLength({ min: 6, max: 10 }).withMessage('pincode must be 6-10 characters.'),
    body('total_land_area_acres').optional().isFloat({ min: 0 }).withMessage('total_land_area_acres must be a non-negative number.'),
  ],
  createFarmer
);

// PATCH /api/farmers/:id
router.patch(
  '/:id',
  requireRole('farmer', 'fpo', 'admin'),
  [param('id').isUUID()],
  updateFarmer
);

// DELETE /api/farmers/:id — admin and fpo
router.delete('/:id', requireRole('admin', 'fpo'), [param('id').isUUID()], deleteFarmer);

export default router;
