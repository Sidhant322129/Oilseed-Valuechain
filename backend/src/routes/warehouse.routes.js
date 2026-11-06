// src/routes/warehouse.routes.js
import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { listWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse } from '../controllers/warehouse.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('fpo', 'processor', 'government', 'admin'), listWarehouses);
router.get('/:id', requireRole('fpo', 'processor', 'government', 'admin'), getWarehouse);

router.post(
  '/',
  requireRole('fpo', 'processor', 'admin'),
  [
    body('name').notEmpty().withMessage('name is required.'),
    body('state').notEmpty().withMessage('state is required.'),
    body('district').notEmpty().withMessage('district is required.'),
    body('address').notEmpty().withMessage('address is required.'),
    body('pincode').isLength({ min: 6, max: 10 }),
    body('total_capacity_tonnes').isFloat({ min: 0.01 }),
    body('available_capacity_tonnes').isFloat({ min: 0 }),
  ],
  createWarehouse
);

router.patch('/:id', requireRole('fpo', 'processor', 'admin'), updateWarehouse);
router.delete('/:id', requireRole('admin', 'processor', 'fpo'), deleteWarehouse);

export default router;
