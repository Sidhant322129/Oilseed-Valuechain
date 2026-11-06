---
description: Sets up Week 1: Supabase schema (14 tables), RLS policies, storage buckets, and the full monorepo folder structure for the oilseed value chain platform.
---

# Week 1: System Design and Database Setup

Trigger: /week1-database-setup

## Objective
Execute Week 1 of the 8-week plan: initialize the Supabase schema,
RLS policies, storage bucket config, and the full monorepo folder
skeleton — as real files in this repo, not descriptions.

## Steps to Execute

1. **Create folder skeleton**
   Generate the full monorepo structure exactly as defined in
   .agents/rules/oilseed-value-chain-builder.md:
   backend/, frontend/, ai-engine/, blockchain/, database/, docs/
   with all subfolders (routes, controllers, middleware, services,
   utils, config for backend; components, pages/{role}, routes,
   hooks, lib, styles for frontend; app/{routes,models,services,utils}
   for ai-engine; contracts/, abis/ for blockchain).
   Add .gitkeep in empty folders. Add .gitignore covering
   node_modules, __pycache__, .env, .venv, dist, build.

2. **Write database/schema.sql**
   Full CREATE TABLE statements for all 14 tables: users, farmers,
   land_records, crops, batches, orders, warehouses, logistics,
   price_history, weather_logs, pest_reports, loan_applications,
   insurance_claims, notifications.
   - public.users references auth.users(id) 1:1, stores role
     (farmer/fpo/processor/retailer/government/admin) as TEXT
     with a CHECK constraint, not a Postgres ENUM.
   - Use gen_random_uuid() for all primary keys.
   - Define every FK relationship explicitly (crops -> farmers,
     batches -> crops, orders -> batches, logistics -> batches +
     warehouses, pest_reports -> crops + farmers, etc.)
   - Add created_at / updated_at timestamptz defaults on every table.
   - Add inline comments explaining each table's purpose.

3. **Write database/rls_policies.sql**
   Enable RLS on all 14 tables. Write explicit policies per role:
   - farmers: can only SELECT/INSERT/UPDATE their own rows
     (match auth.uid() to farmer's linked user_id)
   - fpo: can read farmers under their org, manage orders/batches
     they're involved in
   - processor/retailer: read access scoped to batches/orders
     they're a party to
   - government/admin: broad read access across all tables,
     write access limited to their own admin actions
   - Never leave a table with RLS enabled and zero policies.

4. **Write database/seed_data.sql**
   Minimal fake test data: 2-3 users per role, a few crops/batches/
   orders, so Week 2 API testing has something to query against.

5. **Write .env.example files**
   backend/.env.example and ai-engine/.env.example (as .env
   equivalent, e.g. via python-dotenv) with placeholder keys for
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY —
   never real values.

6. **Write README.md**
   Top-level README with project name, tech stack summary
   (link to docs/techstack.md), and setup instructions for
   running schema.sql against a fresh Supabase project.

7. **Write docs/eight_week_plan.md and docs/techstack.md**
   Copy the finalized 8-week plan and updated tech stack into
   these files so they're version-controlled, not just in chat.

## Constraints
- Zero placeholders — no // TODO, no "implement later" comments.
- Every file must be syntactically valid and ready to run/commit.
- Do not touch backend/frontend/ai-engine/blockchain logic yet —
  Week 1 is schema + repo skeleton only.
- After generating, list every file created so I can review before
  committing.