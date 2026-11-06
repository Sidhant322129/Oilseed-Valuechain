// src/routes/crops.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { listCrops, getCrop, createCrop, updateCrop, deleteCrop, getRegionalCropHealth } from '../controllers/crops.controller.js';

const router = Router();
router.use(authenticate);

const CROP_TYPES = ['mustard', 'soybean', 'soyabean', 'groundnut', 'sunflower', 'sesame', 'linseed', 'castor', 'safflower', 'niger'];
const SEASONS = ['kharif', 'rabi', 'zaid'];

router.get('/regional-crop-health', requireRole('government', 'admin'), getRegionalCropHealth);
router.get('/', requireRole('farmer', 'fpo', 'admin'), listCrops);
router.get('/:id', requireRole('farmer', 'fpo', 'admin'), [param('id').isUUID()], getCrop);

router.post(
  '/',
  requireRole('farmer', 'fpo'),
  [
    body('farmer_id').isUUID().withMessage('farmer_id must be a valid UUID.'),
    body('crop_type').isIn(CROP_TYPES).withMessage(`crop_type must be one of: ${CROP_TYPES.join(', ')}`),
    body('variety').notEmpty().withMessage('variety is required.'),
    body('season').isIn(SEASONS).withMessage(`season must be one of: ${SEASONS.join(', ')}`),
    body('sowing_date').isISO8601().withMessage('sowing_date must be a valid ISO 8601 date.'),
    body('expected_harvest_date').isISO8601().withMessage('expected_harvest_date must be a valid ISO 8601 date.'),
    body('acreage_allocated').isFloat({ min: 0.01 }).withMessage('acreage_allocated must be a positive number.'),
  ],
  createCrop
);

router.patch('/:id', requireRole('farmer', 'fpo', 'admin'), [param('id').isUUID()], updateCrop);
router.delete('/:id', requireRole('farmer', 'fpo', 'admin'), [param('id').isUUID()], deleteCrop);

export default router;
