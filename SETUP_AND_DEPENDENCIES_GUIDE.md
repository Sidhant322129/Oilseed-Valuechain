# 🌾 Oilseed Value Chain Platform
## Complete Setup, Dependencies & Execution Guide

**Project:** AI-Enabled Value Chain Platform for Oilseed Self-Reliance  
**Technology Stack:** React.js (Vite) + JavaScript, Supabase (PostgreSQL & Auth), Python AI Engine, Web3 Sepolia Blockchain

---

## 1. System Prerequisites

Before running the project on any computer, ensure the following software is installed:

| Software | Required Version | Download Link |
| :--- | :--- | :--- |
| **Node.js** | v22.12+ (LTS recommended) | [https://nodejs.org/](https://nodejs.org/) |
| **npm** | v10+ (Bundled with Node) | Included with Node.js |
| **Python** | v3.12 | [https://www.python.org/](https://www.python.org/) |
| **Git** | Any recent version | [https://git-scm.com/](https://git-scm.com/) |
| **Web Browser** | Chrome, Edge, Brave, or Firefox | Any modern browser |

To verify installations, run in terminal/command prompt:
```bash
node -v
npm -v
git --version
```

---

## 2. Complete List of React + JS Dependencies

### Production Dependencies (`dependencies`)

| Package Name | Version | Purpose & Description | Installation Command |
| :--- | :--- | :--- | :--- |
| `react` | `^19.2.8` | Core React UI library | `npm install react` |
| `react-dom` | `^19.2.8` | React DOM rendering for web | `npm install react-dom` |
| `react-router-dom` | `^7.18.3` | Client-side routing & navigation | `npm install react-router-dom` |
| `@supabase/supabase-js` | `^2.49.1` | Supabase Client (Auth, PostgreSQL DB, Storage) | `npm install @supabase/supabase-js` |
| `lucide-react` | `^0.475.0` | Modern UI & Agri-system Icons | `npm install lucide-react` |
| `recharts` | `^3.10.1` | Interactive charts for AI price/demand forecasting | `npm install recharts` |
| `leaflet` | `^1.9.4` | OpenStreetMap mapping engine | `npm install leaflet` |
| `react-leaflet` | `^5.0.0` | React wrapper for Leaflet interactive maps | `npm install react-leaflet` |
| `axios` | `^1.20.0` | HTTP client for AI engine and REST API calls | `npm install axios` |
| `pg` | `^8.23.0` | PostgreSQL client utility | `npm install pg` |

### Development Dependencies (`devDependencies`)

| Package Name | Version | Purpose & Description | Installation Command |
| :--- | :--- | :--- | :--- |
| `vite` | `^8.2.2` | Fast modern frontend build tool & dev server | `npm install -D vite` |
| `@vitejs/plugin-react` | `^6.1.1` | Vite official React plugin (JSX/Fast Refresh) | `npm install -D @vitejs/plugin-react` |

---

## 3. Step-by-Step Installation Commands

### Step 1: Clone or Download the Repository
```bash
git clone https://github.com/your-username/Oilseed-valueChain.git
cd Oilseed-valueChain
```

### Step 2: Install All Dependencies
Run these commands from the repository root in PowerShell:
```powershell
npm ci
Push-Location backend
npm ci
Pop-Location
py -3.12 -m venv ai-service/venv
ai-service/venv/Scripts/python.exe -m pip install -r ai-service/requirements.txt
```

---

## 4. Environment Variables Setup (`.env.local`)

Copy the example files once, then fill in your own credentials. Do not upload the resulting local `.env` files:

```powershell
Copy-Item .env.example .env.local
Copy-Item backend/.env.example backend/.env
Copy-Item ai-service/.env.example ai-service/.env
```

The root `.env.local` uses frontend-safe Supabase settings:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_STORAGE_CROP_IMAGES_BUCKET=crop-images
VITE_STORAGE_DOCUMENTS_BUCKET=documents
VITE_STORAGE_ML_MODELS_BUCKET=ml-models
```

Put `SUPABASE_SERVICE_ROLE_KEY` only in `backend/.env` and `ai-service/.env`. Never use it in a `VITE_` variable.

---

## 5. Database & Auth Setup (Supabase)

1. Open your **[Supabase Project Dashboard](https://supabase.com/dashboard)**.
2. Go to **SQL Editor** > **New Query**.
3. Run the schema migrations:
   - `supabase/migrations/00000_complete_week1_schema.sql` (Creates all 14 database tables & enums)
   - `supabase/auth_trigger.sql` (Sets up controlled Sign Up vs Sign In RLS & functions)
4. (Optional) In **Authentication > SMTP Settings**, configure custom SMTP (e.g. Gmail SMTP `smtp.gmail.com` on port `587`) for Email OTP delivery.

---

## 6. Running the Application

### Start Development Services
Open three terminals at the repository root and leave each running.

Terminal 1 — Flask AI service:
```powershell
$env:AI_SERVICE_PORT=8000
ai-service/venv/Scripts/python.exe ai-service/app.py
```

Terminal 2 — Node backend:
```powershell
Push-Location backend
npm run dev
```

Terminal 3 — React frontend:
```powershell
npm run dev
```

Open the Vite URL printed in Terminal 3, usually **`http://localhost:3000`**. Backend health: `http://localhost:5000/api/health`. AI health: `http://localhost:8000/api/health`.

### Build for Production
To generate an optimized production bundle:
```bash
npm run build
```

### Preview Production Build Locally
```bash
npm run preview
```

---

## 7. Project Folder Structure

```
Oilseed-valueChain/
├── index.html                  # HTML entry point
├── package.json                # Project dependencies & scripts
├── vite.config.js              # Vite configuration
├── .env.example                # Safe frontend environment template
├── SETUP_AND_DEPENDENCIES_GUIDE.md # Markdown guide
├── SETUP_AND_DEPENDENCIES_GUIDE.pdf # Printable PDF guide
├── public/                     # Static assets
├── src/
│   ├── main.jsx                # Application React root mounting
│   ├── App.jsx                 # App routing & session state listener
│   ├── index.css               # Sovereign Harvest design system & dark theme
│   ├── lib/
│   │   ├── auth.js             # Supabase Auth, OTP, Google OAuth & profile helpers
│   │   ├── supabaseClient.js   # Supabase client singleton instance
│   │   └── constants.js        # User roles & platform constants
│   └── pages/
│       └── Login.jsx           # Unified Sign In / Sign Up authentication UI
└── supabase/
    ├── auth_trigger.sql        # Controlled OAuth & OTP DB functions
    └── migrations/             # 14 SQL table schema migrations
```

---

## 8. Troubleshooting Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `VITE_SUPABASE_ANON_KEY missing` | `.env.local` not created | Create `.env.local` and add `VITE_SUPABASE_ANON_KEY` |
| `Port 3000 in use` | Another process on port 3000 | Vite will automatically use port 3001 or kill the previous process |
| `500 Server Error on OTP` | SMTP credentials wrong | Verify Gmail App Password and port 587 in Supabase SMTP settings |
| `User not registered error` | Attempting Sign In with new user | Switch to the **Sign Up** tab to create an account |

---
*Created for NMEO-OP AI-Enabled Oilseed Value Chain Initiative.*
