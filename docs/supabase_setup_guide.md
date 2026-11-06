# Supabase Setup & Execution Guide

## Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
**Target Supabase Project:** `https://aiobuiyuarozsbfzonam.supabase.co`

---

## Step 1: Execute Database Schema & Storage Setup

1. Open your Supabase Dashboard: [https://supabase.com/dashboard/project/aiobuiyuarozsbfzonam](https://supabase.com/dashboard/project/aiobuiyuarozsbfzonam)
2. In the left navigation menu, click **SQL Editor** (`>_`).
3. Click **New Query**.
4. Open the master schema script in this repository:
   - [supabase/migrations/00000_complete_week1_schema.sql](file:///c:/Users/sabit/OneDrive/Desktop/Oilseed-valueChain/supabase/migrations/00000_complete_week1_schema.sql)
5. Copy all the contents and paste them into the SQL Editor.
6. Click **Run** (or press `Ctrl + Enter`).
7. You should see `Success. No rows returned.` All **14 tables**, enums, indexes, triggers, storage buckets, and RLS policies are now active!

---

## Step 2: Seed Sample Market & Weather Data (Optional but Recommended)

1. In the Supabase **SQL Editor**, click **New Query**.
2. Open:
   - [supabase/seed.sql](file:///c:/Users/sabit/OneDrive/Desktop/Oilseed-valueChain/supabase/seed.sql)
3. Copy and paste the contents, then click **Run**.
4. This will populate benchmark APMC mandi prices (Mustard, Soybean, Groundnut, Sunflower, Sesame), weather stations, and accredited warehouses.

---

## Step 3: Configure Supabase Auth

### A. Email OTP (Passwordless Magic Code - Active by Default)
- Supabase enables Email Auth by default with its built-in SMTP engine.
- To verify settings:
  1. Go to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Email**.
  2. Ensure **"Enable Email provider"** is toggled **ON**.
  3. Ensure **"Confirm email"** is toggled ON (or OFF if you want immediate instant login in development).
   4. Open **Authentication** $\rightarrow$ **Email Templates** $\rightarrow$ **Magic Link**.
  5. Add this text to the template: `Your verification code is: {{ .Token }}`.
  6. Save the template, then check Gmail Inbox, Spam, and Promotions for the Supabase email containing the 6-digit code.
### B. Google OAuth Login
The frontend cannot enable OAuth providers. For the hosted project configured in `.env.local`, complete this provider setup in Supabase before testing the button:
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select an existing one $\rightarrow$ **APIs & Services** $\rightarrow$ **Credentials**.
3. Click **Create Credentials** $\rightarrow$ **OAuth client ID** (Application type: *Web application*).
4. In **Authorized redirect URIs**, add your Supabase callback URL:
   ```
   https://aiobuiyuarozsbfzonam.supabase.co/auth/v1/callback
   ```
5. Copy your **Client ID** and **Client Secret**.
6. In your Supabase Dashboard, navigate to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Google**.
7. Toggle **"Enable Google provider"** to **ON**.
8. Paste your **Client ID** and **Client Secret**, then click **Save**.

---

## Step 4: Verify Storage Buckets

Navigate to **Storage** in your Supabase Dashboard. You will see all 3 buckets pre-configured by our SQL script:
1. `crop-images` (Public bucket for farmer pest diagnostic scans and farm photos)
2. `documents` (Private bucket for KYC documents, land deeds, loan applications, and insurance proofs)
3. `ml-models` (Private bucket for Week 5-6 AI model weights and ONNX neural network files)

---

## Step 5: Configure Local Environment Variables

1. In Supabase Dashboard, go to **Project Settings** $\rightarrow$ **API**.
2. Copy the `anon / public` key.
3. Open [.env.local](file:///c:/Users/sabit/OneDrive/Desktop/Oilseed-valueChain/.env.local) in this project.
4. Set:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://aiobuiyuarozsbfzonam.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... (your key here)
   ```

---

## Step 6: Verify Database Connection

Run the verification test script:
```bash
npm run db:test
```
or
```bash
npx ts-node scripts/test-db-connection.ts
```
All 14 tables and 3 storage buckets will report green status!
