import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  listBatches, getBatch, updateBatchStatus, placeOrder, listOrders, confirmPayment, downloadInvoice, cancelOrder,
  createProcurementOrder, listMarketplaceBids, createMarketplaceBid, createRazorpayOrder,
} from '../controllers/marketplace.controller.js';

const router = Router();
router.use(authenticate);

// Procurement bids
router.get('/procurement-bids', listMarketplaceBids);
router.post('/procurement-bids', createMarketplaceBid);

// Browse available batches — all authenticated roles
router.get('/batches', listBatches);
router.get('/batches/:id', getBatch);
router.patch('/batches/:id', updateBatchStatus);

// Place an order — processor or retailer
router.post(
  '/orders',
  [
    body('batch_id').isUUID().withMessage('batch_id must be a valid UUID.'),
    body('quantity_kg').isFloat({ min: 0.01 }).withMessage('quantity_kg must be a positive number.'),
    body('unit_price_per_kg').isFloat({ min: 0.01 }).withMessage('unit_price_per_kg must be a positive number.'),
    body('delivery_address').notEmpty().withMessage('delivery_address is required.'),
    body('delivery_pincode').isLength({ min: 6, max: 10 }).withMessage('delivery_pincode must be 6-10 characters.'),
  ],
  placeOrder
);

// Create procurement order from accepted FPO bid quote
router.post('/procurement-orders', createProcurementOrder);

// List orders — own orders or all (admin)
router.get('/orders', listOrders);

// Cancel/delete an unpaid order — buyer or admin
router.delete('/orders/:id', cancelOrder);
router.patch('/orders/:id/cancel', cancelOrder);

// Pay for an order — buyer or admin
router.post('/orders/:id/create-razorpay-order', createRazorpayOrder);
router.post('/orders/:id/pay', confirmPayment);
router.patch('/orders/:id/pay', confirmPayment);

// Download PDF invoice — buyer or admin
router.get('/orders/:id/invoice', downloadInvoice);

export default router;
