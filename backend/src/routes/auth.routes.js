// src/routes/auth.routes.js
import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  signup, login, verifyOtp, refreshSession,
  getMe, logout, digilockerInitiate,
} from '../controllers/auth.controller.js';

const router = Router();

const VALID_ROLES = ['farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'];

// POST /api/auth/signup
router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
    body('role').optional().isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(', ')}`),
    body('full_name').optional().isString().trim().isLength({ min: 2 }).withMessage('full_name must be at least 2 characters.'),
  ],
  signup
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
  ],
  login
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
    body('token').isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.').isNumeric(),
    body('role').optional().isIn(VALID_ROLES),
    body('full_name').optional().isString().trim(),
  ],
  verifyOtp
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  [body('refresh_token').notEmpty().withMessage('refresh_token is required.')],
  refreshSession
);

// GET /api/auth/me — requires authentication
router.get('/me', authenticate, getMe);

// POST /api/auth/logout — requires authentication
router.post('/logout', authenticate, logout);

// POST /api/auth/digilocker — eKYC scaffold (Week 8), requires farmer auth
router.post('/digilocker', authenticate, digilockerInitiate);

export default router;
