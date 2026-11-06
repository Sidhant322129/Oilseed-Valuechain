---
trigger: always_on
---

# AI enabled Value Chain Platform Builder

## Role
Act as a Senior Full-Stack Software Engineer, Web3 Blockchain Developer, and Machine Learning Architect. Design and generate a production-grade, deployable AI-Enabled Value Chain Platform for Oilseed Self-Reliance. Make explicit, justified technical decisions rather than generic placeholders. The system must seamlessly integrate a Node.js backend, a Python/Flask AI microservice, Ethereum smart contracts, and a React frontend, ultimately destined for deployment on AWS EC2.

## Project Overview
Build a full-stack agricultural platform connecting farmers, FPOs (Farmer Producer Organizations), processors, retailers, and government entities. Core capabilities include: Supabase authentication (OTP/Google), eKYC via DigiLocker, marketplace order placement with Razorpay integration, blockchain-backed supply chain provenance tracking (Ethereum Sepolia + IPFS), AI-driven price/demand forecasting (Random Forest/Statsmodels), and CNN-based pest detection with SMS alerts. The system must be secure, strictly role-gated, and deployable end-to-end on AWS EC2 and S3.

## Agent Flow — MUST FOLLOW

When requested to build any module, dashboard, contract, or microservice for the platform:
1. **Zero Placeholders:** Deliver complete, fully written, syntax-valid files with full logic, error boundaries, and types. Never write `// TODO` or `// Implement later`.
2. **Context-Aware Integration:** Always preserve cross-layer contracts (e.g., ensuring Node.js endpoints match Flask AI payloads and Solidity smart contract event schemas).
3. **Role-Enforced Access:** Default to zero trust. Every route, query, and UI component must respect the 6 user roles (`farmer`, `fpo`, `processor`, `retailer`, `government`, `admin`).

---

## Fixed Design System (NEVER CHANGE)

Apply these interface standards across all React dashboard modules:

### Aesthetic Identity: "Sovereign Harvest"
* **Theme & Vibe:** Industrial agricultural control center meets institutional Web3 terminal.
* **Palette:**
  * **Primary (Canola Gold):** `#E5A93C`
  * **Secondary / Forest Depth:** `#14291F`
  * **Background (Dark Slate):** `#0D1117`
  * **Card Surface:** `#161B22` with border `#30363D`
  * **Accent / Telemetry (Emerald Green):** `#2EA043`
  * **Alert / Pest Risk (Crimson):** `#DA3633`
* **Typography:**
  * Headings: `Space Grotesk` (tight tracking)
  * Interface & Labels: `Inter`
  * Blockchain Hashes, CIDs, & Data Telemetry: `JetBrains Mono`

### Micro-Interactions & Visual Polish
* **Containers:** Consistent `rounded-xl` borders with subtle border glows (`border border-white/10`).
* **Status Badges:** Dynamic color-coded badges for supply chain lifecycle stages (`Registered` → `Certified` → `Dispatched` → `Received` → `Sold`).
* **Data Density:** Use Recharts with custom tooltips, gradient area fills, and responsive chart containers.

---

## System Architecture & Module Rules

### 1. Database & Authentication (Supabase)
* **Tables (14 Entities):** Strictly maintain schema relationships across `farmers`, `land_records`, `crops`, `batches`, `orders`, `warehouses`, `logistics`, `price_history`, `weather_logs`, `pest_reports`, `loan_applications`, `insurance_claims`, `notifications`, and `users`.
* **Auth Guard:** Authenticate via Supabase Email OTP and Google OAuth. Validate JWTs on backend API calls and extract user metadata into request contexts.
* **Storage Buckets:** Route media strictly to `crop-images`, `documents`, or `ml-models`.

### 2. Node.js & Express API Layer
* **Structure:** Enforce modular separation into `/routes`, `/controllers`, `/middleware`, and `/services`.
* **Role-Based Access Control (RBAC):** Middleware must intercept Supabase JWT tokens and verify role permissions before hitting controller logic.
* **Service Integrations:**
  * Payments: Razorpay order creation and cryptographic signature webhook verification.
  * Invoices & Docs: Automated PDFKit document generation with Nodemailer dispatch.
  * Identity: Setu DigiLocker Sandbox API routes for farmer eKYC.

### 3. AI & ML Microservice (Python / Flask)
* **Price Prediction:** Random Forest Regression trained on historical commodity prices using 7/14/30-day lag features and harvest cycle seasonality via `/api/predict-price`.
* **Demand Forecasting:** Seasonal moving averages with linear trend decomposition via `/api/forecast-demand`.
* **CNN Pest Detection:** 3 Conv2D + MaxPooling deep learning classifier for soyabean leaf pathology via `/api/detect-pest`. If confidence exceeds threshold, trigger Fast2SMS alerts.
* **Storage Integration:** Load serialized model weights directly from the Supabase `ml-models` bucket.

### 4. Blockchain Layer (Ethereum Sepolia + IPFS)
* **Solidity Smart Contracts (v0.8.x):**
  * `FarmerRegistry.sol`: Maps farmer wallet addresses to sovereign IDs.
  * `BatchRecord.sol`: State machine governing batch transitions and certification.
  * `OwnershipTransfer.sol`: Emits on-chain transfer events upon verified payments.
  * `QualityOracle.sol`: Stores Pinata IPFS content identifiers (CIDs) for soil and quality certificates.
* **Web3 Integration:** Use Web3.js to execute contract calls and index on-chain events into the web dashboards.

---

## Component Architecture (Dashboards)

* **Farmer Dashboard:** Crop registration wizard, real-time price trend alerts, CNN pest image upload with diagnosis feedback, DigiLocker eKYC status.
* **FPO Dashboard:** Collective farmer registry, bulk procurement order management, storage inventory trackers.
* **Processor Dashboard:** Batch intake verification, quality parameter updates, blockchain QR provenance generator.
* **Retailer / Buyer Dashboard:** Marketplace catalog, Razorpay checkout, provenance verification viewer, invoice download center.
* **Government Dashboard:** Regional price monitoring charts (Recharts), oilseed self-reliance index, warehouse capacity heatmaps, scheme eligibility validator.
* **Admin Dashboard:** Service telemetry, smart contract addresses monitor, and system audit logs.