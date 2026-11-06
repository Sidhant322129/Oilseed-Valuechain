---
description: # Week 3: React.js Web Dashboards (All 6 Roles)  Trigger: /week3-dashboards  ## Objective Execute Week 3 of the 8-week plan: build all 6 role-based dashboards in React.js (Vite), connected to the Week 2 backend API. Zero mock/ dummy/placeholder data 
---

# Week 3: React.js Web Dashboards (All 6 Roles)

Trigger: /week3-dashboards

## Objective
Execute Week 3 of the 8-week plan: build all 6 role-based dashboards
in React.js (Vite), connected to the Week 2 backend API. Zero mock/
dummy/placeholder data anywhere — every data-driven element either
fetches real data or shows a genuine empty/pending state.

## Context (already done — do not redo)
- Week 1: Supabase schema (14 tables), RLS, Auth (Email OTP + Google
  OAuth), storage buckets
- Week 2: Express backend, JWT middleware, role-based access control,
  all base API routes live and role-gated, Postman collection exists
- Known bugs already fixed: role-routing defaulting to farmer, OTP
  bypass on page refresh, "[object Object]" error display bug — do
  not reintroduce any of these

## Steps to Execute

1. **React Router Setup**
   frontend/src/routes/ — protected route structure.
   Exact redirect table (all 6, must match precisely):
   farmer -> /dashboard/farmer
   fpo -> /dashboard/fpo
   processor -> /dashboard/processor
   retailer -> /dashboard/retailer
   government -> /dashboard/government
   admin -> /dashboard/admin
   ProtectedRoute wrapper: reads the real role from session/req.user,
   never defaults to farmer if role is missing — show an error state
   instead ("Account role not set, contact support"). If a logged-in
   user manually navigates to a dashboard route that doesn't match
   their role, redirect them to their own correct dashboard.

2. **Shared Components**
   frontend/src/components/ — Navbar (role-aware nav items), Sidebar,
   LoadingSpinner, EmptyState (single reusable component accepting a
   message prop, used everywhere instead of mock data), ErrorBoundary.
   Also create/fix frontend/src/utils/getErrorMessage.js — a shared
   utility that safely extracts a readable string from any error
   shape (Error instance, Axios error, Supabase error, plain string),
   falling back to "Something went wrong. Please try again." Never
   render a raw error/response object directly in JSX anywhere.

3. **Farmer Dashboard (/dashboard/farmer)**
   - Crop registration form -> real POST /crops
   - Marketplace browse -> real GET /marketplace, EmptyState if none
   - Pest image upload -> real upload UI; EmptyState: "Pest detection
     will be available once the AI engine is live (Week 6)"
   - Price alert panel -> EmptyState: "Price predictions will be
     available once the forecasting model is live (Week 5)"
   - Loan application form -> real POST /finance/loan-applications

4. **FPO Dashboard (/dashboard/fpo)**
   - Member farmer list -> real GET /farmers, EmptyState if none
   - Bulk order placement -> real POST /marketplace
   - Procurement bid management -> real GET/POST, EmptyState if none
   - Warehouse + storage view -> real GET /warehouse, EmptyState if none

5. **Processor Dashboard (/dashboard/processor)**
   - Incoming procurement orders -> real GET, EmptyState if none
   - Batch processing status update -> real form, updates Supabase
     batch status only (note: "On-chain sync activates in Week 4")
   - Warehouse entry management -> real GET/POST /warehouse
   - Blockchain QR verification -> UI shell + EmptyState: "Available
     once smart contracts are deployed (Week 4)"

6. **Retailer/Buyer Dashboard (/dashboard/retailer)**
   - Browse produce listings -> real GET /marketplace, EmptyState if none
   - Place purchase orders -> real POST /marketplace
   - QR scan -> provenance trail -> EmptyState: "Available once
     blockchain integration is live (Week 4)"
   - Invoice download -> EmptyState: "Available once payments are
     live (Week 7)"
   - Payment history -> real fetch, EmptyState if none

7. **Government Dashboard (/dashboard/government)**
   - Price trend charts (Recharts) -> real fetch from price_history;
     empty chart state if no data — never hardcode sample values
   - Regional crop health map (React-Leaflet + OpenStreetMap) -> base
     map renders with no markers if no crop health data exists yet
     (depends on Open-Meteo, Week 8)
   - Warehouse occupancy monitor -> real GET /warehouse, EmptyState
     if none
   - Scheme eligibility viewer -> real UI, EmptyState if none

8. **Admin Dashboard (/dashboard/admin)**
   - User management -> real GET /admin, real table, EmptyState if
     applicable
   - Service telemetry -> honest "Not yet implemented" panel, no fake
     metrics
   - Smart contract address monitor -> EmptyState: "No contracts
     deployed yet (Week 4)"
   - System audit logs -> real fetch if data exists, EmptyState if none

9. **Wire Login -> Correct Dashboard**
   Confirm the existing Login page correctly redirects each of the
   6 roles to their own dashboard after successful login — retest
   explicitly since this is the exact bug fixed earlier.

## Hard Rule Across Every Dashboard
- Never hardcode sample farmers, crops, prices, orders, chart data,
  map markers, or metrics anywhere.
- Every data section is either a real fetch or a real EmptyState.

## Constraints
- Do not modify backend/, ai-engine/, blockchain/, or database/
- Do not implement AI predictions, blockchain calls, or payment
  logic — only the EmptyState patterns described above
- Zero placeholder code, zero TODOs
- After generating, list every file created/modified so I can review
  before committing

## Final Verification (report this back)
For each of the 6 roles: confirm login redirects to the exact correct
dashboard, and confirm every data section shows either real fetched
data or a proper empty state — nothing hardcoded, nothing fake.