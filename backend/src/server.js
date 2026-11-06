// src/server.js — Sovereign Harvest Express backend API server
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { runAgmarknetIngestion } from './services/agmarknet.service.js';
import { runAnomalyDetection } from './services/bidMonitor.service.js';

import authRoutes from './routes/auth.routes.js';
import farmerRoutes from './routes/farmers.routes.js';
import cropRoutes from './routes/crops.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import blockchainRoutes from './routes/blockchain.routes.js';
import aiRoutes from './routes/ai.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import financeRoutes from './routes/finance.routes.js';
import warehouseRoutes from './routes/warehouse.routes.js';
import logisticsRoutes from './routes/logistics.routes.js';
import adminRoutes from './routes/admin.routes.js';
import priceRoutes from './routes/prices.routes.js';
import schemeRoutes from './routes/schemes.routes.js';
import schemeCatalogRoutes from './routes/schemeCatalog.routes.js';
import auctionRoutes from './routes/auction.routes.js';
import { runAuctionLifecycleJob } from './services/auction.service.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const isDev = process.env.NODE_ENV !== 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In development mode, allow any localhost / 127.0.0.1 port
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin "${origin}" is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-simulate-scheme-role'],
  })
);

// ─── Request Logging ─────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Body Parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting on Auth Routes ────────────────────────────────────────────
// 10 requests per 15 minutes per IP — prevents OTP spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Oilseed Value Chain API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/farmers', farmerRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/scheme-catalog', schemeCatalogRoutes);
app.use('/api/auction', auctionRoutes);

// ─── 404 + Error Handlers ────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🌾 Oilseed Value Chain API running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 Environment: ${process.env.NODE_ENV || 'development'}\n`);

  // ─── Live Auction Lifecycle Engine — runs every 30 seconds ──────────────
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const res = await runAuctionLifecycleJob();
      if (res?.closedCount > 0 || res?.transitionedLive > 0) {
        console.log(`[AUCTION-CRON] Closed: ${res.closedCount}, Live: ${res.transitionedLive}, Closing: ${res.transitionedClosing}`);
      }
    } catch (err) {
      console.error('[AUCTION-CRON] Lifecycle tick failed:', err.message);
    }
  });
  console.log('[CRON] Live Auction lifecycle engine scheduled (every 30s).');

  // ─── Procurement Bidding Anomaly Detection — runs every 5 minutes ─────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res = await runAnomalyDetection();
      if (res?.flags_raised > 0) {
        console.log(`[CRON] Procurement anomaly scan: ${res.flags_raised} flags raised (${res.checked} bids checked).`);
      }
    } catch (err) {
      console.error('[CRON] Procurement anomaly scan failed:', err.message);
    }
  });
  console.log('[CRON] Procurement bidding anomaly detection scheduled (every 5 min).');

  // ─── AGMARKNET Price Ingestion — runs at startup + every 6 hours ──────────
  // Startup run: ingest latest prices so the Government Dashboard chart is
  // populated immediately after server boot, without waiting for the cron tick.
  if (process.env.DATA_GOV_API_KEY) {
    console.log('[CRON] Running initial AGMARKNET price ingestion on startup…');
    runAgmarknetIngestion()
      .then(result => console.log('[CRON] Startup ingestion done:', JSON.stringify(result.summary)))
      .catch(err => console.error('[CRON] Startup ingestion failed:', err.message));

    // Every 6 hours: 0:00, 6:00, 12:00, 18:00
    cron.schedule('0 0,6,12,18 * * *', () => {
      console.log('[CRON] Scheduled AGMARKNET ingestion starting…');
      runAgmarknetIngestion()
        .then(result => console.log('[CRON] Scheduled ingestion done:', JSON.stringify(result.summary)))
        .catch(err => console.error('[CRON] Scheduled ingestion failed:', err.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('[CRON] AGMARKNET price ingestion scheduled (every 6h, IST).');
  } else {
    console.warn('[CRON] DATA_GOV_API_KEY not set — AGMARKNET ingestion disabled.');
  }
});

export default app;
