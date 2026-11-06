---
description: # Week 2 Verification Checklist ## Node.js + Express Backend API Layer
---

# Week 2 Verification Checklist
## Node.js + Express Backend API Layer

Use this to verify Antigravity's output covers everything requested.
Check off each item against the actual files generated — if any box
can't be checked, send that specific item back to the agent by name.

---

## 1. Project Setup

- [ ] `backend/` folder initialised as a Node.js + Express project
- [ ] Folder structure present: `backend/src/routes`, `controllers`,
      `middleware`, `services`, `utils`, `config`
- [ ] `package.json` includes: `express`, `cors`, `dotenv`, `helmet`,
      `@supabase/supabase-js`, `morgan`, `express-rate-limit`
      (`jsonwebtoken` only if the agent justified needing it over
      Supabase's own verification method)
- [ ] `backend/.env.example` exists with placeholders only:
      `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `PORT`, `NODE_ENV` — **no real values committed**
- [ ] `backend/src/config/supabaseClient.js` exists, initialises client
      using the **service role key** for server-side use

---

## 2. JWT Auth Middleware

- [ ] `backend/src/middleware/authMiddleware.js` exists
- [ ] Reads `Authorization: Bearer <token>` header
- [ ] Verifies the token via a real Supabase server-side method
      (e.g. `supabase.auth.getUser(token)`) — **not** just decoding the
      JWT payload without signature verification
- [ ] On valid token: attaches `req.user` with `id`, `email`, `role`
- [ ] On missing/invalid/expired token: returns `401` with a clean JSON
      error, no internal error/stack leakage
- [ ] Agent explained *why* it chose its verification method (should
      have asked or justified this per the prompt's checkpoint)

---

## 3. Role-Based Access Middleware

- [ ] `backend/src/middleware/roleMiddleware.js` exists
- [ ] Exports something like `requireRole(...allowedRoles)`
- [ ] Runs strictly **after** `authMiddleware` (depends on `req.user`)
- [ ] Returns `403` with clear message when role isn't allowed
- [ ] Supports all 6 roles: `farmer`, `fpo`, `processor`, `retailer`,
      `government`, `admin`

---

## 4. Base API Routes — All Present

Each should exist as its own route file with a matching controller.
Confirm auth + role gating is real, not commented out or stubbed.

- [ ] `/auth` — signup/login, calls `check_user_exists`, issues/
      refreshes sessions
- [ ] `/auth/digilocker` — scaffold only, validates input + auth,
      returns structured `501` "integration pending" (Week 8 = real
      logic)
- [ ] `/farmers` — CRUD, role-gated to `farmer`/`fpo`/`admin`
- [ ] `/crops` — CRUD, role-gated to `farmer`/`fpo`
- [ ] `/marketplace` — scaffolding + validation now, full logic is
      Week 7
- [ ] `/blockchain` — scaffolding + role gating now, full logic is
      Week 4
- [ ] `/ai` — scaffolding + role gating now, full logic is Weeks 5–6
- [ ] `/notifications` — CRUD for `notifications` table
- [ ] `/finance` — `loan_applications`, `insurance_claims` endpoints
- [ ] `/warehouse` — CRUD, role-gated to `fpo`/`processor`/`admin`
- [ ] `/logistics` — CRUD, role-gated to `processor`/`admin`
- [ ] `/admin` — strictly `requireRole('admin')` only

**Red flag check:** any route where auth/role middleware is missing,
or where a "not yet implemented" response was used for something that
was actually supposed to be fully built this week (e.g. `/farmers`
CRUD) — that's scope-skipping, send it back.

---

## 5. `/auth` Wired to `check_user_exists`

- [ ] Signup flow calls `check_user_exists(email)` before creating a
      user
- [ ] Signup with existing email → `409 Conflict` with exact message:
      **"An account with this email already exists. Please sign in
      instead."**
- [ ] Login with non-existent email → `404 Not Found` with exact
      message: **"No account found with this email. Please sign up
      first."**
- [ ] Error strings match **exactly** — no paraphrased variants, since
      Week 3 frontend will match against these

---

## 6. CORS + Security Config

- [ ] CORS restricts origin to `FRONTEND_URL` env var (defaults to
      `http://localhost:3000`)
- [ ] `helmet` is applied globally
- [ ] `express-rate-limit` applied specifically to `/auth` routes
      (reasonable default, e.g. ~10 requests / 15 min / IP)

---

## 7. Error Handling + Response Format

- [ ] `backend/src/middleware/errorHandler.js` exists — centralised
- [ ] Consistent JSON error shape used everywhere:
      `{ error: { message, code } }`
- [ ] 404 handler exists for unmatched routes
- [ ] Controllers use `try/catch` → `next(err)`, not scattered inline
      `res.status(500)` calls

---

## 8. Postman-Readiness

- [ ] Every route returns meaningful status codes (`200/201/400/401/
      403/404/409/501` used appropriately, not everything defaulting
      to `200` or `500`)
- [ ] `backend/postman_collection.json` exists
- [ ] Collection covers **every** route listed in Section 4
- [ ] Includes example request bodies
- [ ] Includes a Bearer token variable placeholder for auth testing

---

## 9. Scope Boundaries Respected

- [ ] **No** changes made to `frontend/`
- [ ] **No** changes made to `ai-engine/`
- [ ] **No** changes made to `blockchain/`
- [ ] **No** changes made to `database/` schema or RLS files
- [ ] **No** real blockchain, AI, payment, or DigiLocker logic
      implemented — scaffolding + validation + auth gating only, for
      routes tied to later weeks
- [ ] Agent listed every file it created/modified before you committed

---

## Quick Test After Generation

1. `cd backend && npm install && npm run dev` — server starts without
   errors
2. Hit any protected route (e.g. `/farmers`) with **no** token → expect
   `401`
3. Hit `/admin` with a valid non-admin token → expect `403`
4. Import `postman_collection.json` into Postman → confirm all routes
   listed and reachable
5. Try signup with an email already in `public.users` → confirm exact
   `409` message
6. Try login with an email not in `public.users` → confirm exact `404`
   message

If any of these fail, that's the specific thing to report back to the
agent — reference the file and section number above rather than
re-describing the whole task.
