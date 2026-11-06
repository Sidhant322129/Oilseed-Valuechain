// backend/src/routes/auction.routes.js
// Production-grade Mandi-Exchange Live Auction Routes

import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import {
  listLots,
  getLotDetail,
  createLot,
  placeBid,
  acceptOffer,
  getMyLots,
  getMyBids,
  getWatchlist,
  toggleWatchlist,
  getLiveMarketTicker,
  listRequirements,
  createRequirement,
  freezeLotHandler,
  unfreezeLotHandler,
  extendLotHandler,
  forceCloseLotHandler,
  voidBidHandler,
} from '../controllers/auction.controller.js';

const router = Router();

// Public / open views with authenticated enhancements
router.get('/lots', listLots);
router.get('/lots/:id', authenticate, getLotDetail);
router.get('/ticker', getLiveMarketTicker);
router.get('/requirements', listRequirements);

// Authenticated Farmer endpoints
router.post('/lots', authenticate, createLot);
router.get('/my-lots', authenticate, getMyLots);
router.post('/lots/:id/accept-offer', authenticate, acceptOffer);

// Authenticated FPO / Buyer bidding endpoints
router.post('/lots/:id/bid', authenticate, placeBid);
router.post('/bid', authenticate, placeBid);
router.get('/my-bids', authenticate, getMyBids);
router.get('/watchlist', authenticate, getWatchlist);
router.post('/watchlist', authenticate, toggleWatchlist);
router.post('/watchlist/:lotId', authenticate, toggleWatchlist);
router.post('/requirements', authenticate, createRequirement);

// Admin Lot Governance endpoints
router.post('/lots/:id/freeze', authenticate, requireRole('admin'), freezeLotHandler);
router.post('/lots/:id/unfreeze', authenticate, requireRole('admin'), unfreezeLotHandler);
router.post('/lots/:id/extend', authenticate, requireRole('admin'), extendLotHandler);
router.post('/lots/:id/force-close', authenticate, requireRole('admin'), forceCloseLotHandler);
router.post('/bids/:id/void', authenticate, requireRole('admin'), voidBidHandler);

export default router;

