# Anfaal Smart Mentorship — Safe Migration Runbook & Cutover Guide

## 1. Executive Summary & Architecture Comparison

This guide documents the complete migration of the **Anfaal Smart Mentorship** platform from its legacy stack to **Next.js 15 (App Router) + Firebase + OpenAI**.

| Component | Legacy Architecture (Before) | Modernized Architecture (After) | Cost & Reliability Benefit |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 19 + Vite (SPA) | Next.js 15 (App Router, SSR, Turbopack) | Instant page loads, SEO, unified codebase |
| **Backend API** | Express.js on Render Web Service | Next.js API Route Handlers (Edge/Node.js) | Serverless, auto-scaling, zero idle costs |
| **Database** | MongoDB Atlas (M0/M10 clusters) | Google Cloud Firestore | Native real-time sync, 99.999% SLA, generous free tier |
| **Authentication** | Custom JWTs + bcrypt | Firebase Auth + Custom Claims (`role`, `menteeId`) | Zero password resets; enterprise session security |
| **Queue / Workers** | BullMQ + Redis Cloud ($15–$30/mo) | Next.js Pipeline + Cloud Tasks / Serverless | **$0 idle Redis costs**, zero stalled job crashes |
| **Storage** | AWS S3 Bucket | Firebase Cloud Storage | Unified GCP billing, native client upload URLs |
| **AI Processing** | OpenAI Whisper + GPT-4o-mini | OpenAI Whisper + GPT-4o-mini | Preserved with zero prompt regression |
| **Reminders** | node-cron in persistent container | Cloud Scheduler / Cron Webhooks | Guaranteed execution; serverless idempotency |

---

## 2. Zero Password Reset Architecture

Existing user passwords in MongoDB are hashed using `bcryptjs`. Under this migration:
1. The migration script imports user documents and preserves their `passwordHash` in Firestore `users/{userId}`.
2. When a user logs in via Email, Phone, or MAKID (`POST /api/auth/login`):
   - Server-side route handler queries `users` by identifier.
   - Verifies the entered password against the stored bcrypt hash using `bcrypt.compare`.
   - On match, auto-provisions or retrieves their Firebase Auth account using their existing UID.
   - Sets Firebase Custom Claims (`role: ADMIN | MENTOR | MENTEE`, `menteeId`, `mentorApprovalStatus`).
   - Mints a Firebase custom token and sets secure HTTP-only `__session` cookies for SSR.
3. **Outcome:** Existing mentors, mentees, and admins log in immediately with their existing credentials without ever being prompted to reset their passwords.

---

## 3. Directory Structure

```
SMART anfaal/
├── backend/                  # (UNTROUCHED) Legacy Express + MongoDB backend
├── frontend/                 # (UNTOUCHED) Legacy Vite + React frontend
├── firestore.rules           # Role-based Firestore security rules
├── storage.rules             # Call recording Cloud Storage security rules
├── firestore.indexes.json    # Firestore compound query indexes
├── firebase.json             # Firebase Emulator & project configuration
├── scripts/
│   └── migrateMongoToFirestore.ts  # Root data migration script
└── next-app/                 # Next.js 15 Modernized Application
    ├── package.json
    ├── scripts/
    │   └── migrateMongoToFirestore.ts
    ├── src/
    │   ├── app/              # 39 Routes (Public, Mentee, Mentor, Admin, API)
    │   │   ├── api/          # Route Handlers (Auth, Calls, Notifications, Cron)
    │   │   ├── admin/        # Admin Portal (12 routes)
    │   │   ├── mentor/       # Mentor Portal (10 routes)
    │   │   ├── mentee/       # Mentee Portal (3 routes)
    │   │   └── login/        # Login page
    │   ├── components/       # Shared UI & Layouts
    │   ├── context/          # Auth & State Contexts
    │   ├── lib/
    │   │   ├── api.ts        # Universal API client
    │   │   ├── auth/         # Server authentication & session tokens
    │   │   ├── firebase/     # Client & Admin SDK singletons
    │   │   └── services/     # Storage, Whisper, GPT-4o-mini, Reminders
    │   └── pwa/              # Progressive Web App install logic
    └── public/               # Static assets & webmanifest
```

---

## 4. Local Development & Testing

### A. Environment Configuration
Copy `.env.example` in `next-app`:
```bash
cd next-app
cp .env.example .env.local
```
Fill in your Firebase project credentials and OpenAI API key. For testing without an OpenAI key, set:
```env
ALLOW_MOCK_AI=true
ALLOW_MOCK_TRANSCRIPTION=true
```

### B. Running Local Development Server
```bash
cd next-app
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### C. Running Firebase Local Emulators (Optional)
If you wish to test Firestore and Storage offline:
```bash
# In the project root
firebase emulators:start
```
Set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `next-app/.env.local`.

---

## 5. Data Migration Guide

The migration script connects directly to your MongoDB Atlas database and migrates all 8 collections into Firestore in chunked batches ($\le 450$ docs/commit).

### Step 1: Run Simulation (Dry-Run)
Ensure `MONGODB_URI` and `FIREBASE_PROJECT_ID` are set in your environment:
```bash
cd next-app
npm run migrate:dry-run
```
*Expected Output:*
```
======================================================
                 MIGRATION SUMMARY
======================================================
┌─────────┬──────────────────────┬────────────┬───────────────┬──────────────┬─────────────┐
│ (index) │ collection           │ mongoCount │ migratedCount │ skippedCount │ status      │
├─────────┼──────────────────────┼────────────┼───────────────┼──────────────┼─────────────┤
│ 0       │ 'users'              │ 34         │ 34            │ 0            │ 'SIMULATED' │
│ 1       │ 'mentors'            │ 12         │ 12            │ 0            │ 'SIMULATED' │
│ 2       │ 'mentees'            │ 21         │ 21            │ 0            │ 'SIMULATED' │
│ 3       │ 'calls'              │ 9          │ 9             │ 0            │ 'SIMULATED' │
│ 4       │ 'mentorships'        │ 19         │ 19            │ 0            │ 'SIMULATED' │
│ 5       │ 'daily_performances' │ 7          │ 7             │ 0            │ 'SIMULATED' │
│ 6       │ 'audit_logs'         │ 37         │ 37            │ 0            │ 'SIMULATED' │
│ 7       │ 'notifications'      │ 58         │ 58            │ 0            │ 'SIMULATED' │
└─────────┴──────────────────────┴────────────┴───────────────┴──────────────┴─────────────┘
```

### Step 2: Execute Live Migration
Once verified, run the live migration:
```bash
npm run migrate
```
To migrate a single collection only:
```bash
npx tsx scripts/migrateMongoToFirestore.ts --collection=users
```

---

## 6. Production Deployment Options

### Option A: Firebase App Hosting (Recommended for Firebase Ecosystem)
Next.js 15 has native first-class support in Firebase App Hosting:
1. Link your GitHub repository in the Firebase Console under **App Hosting**.
2. Specify root directory: `next-app`.
3. Set environment variables in the Firebase Console secrets manager.
4. App Hosting automatically compiles and serves SSR and API routes with Cloud CDN caching.

### Option B: Google Cloud Run (Containerized Docker)
A standard production Dockerfile can be built and deployed to Google Cloud Run:
```bash
cd next-app
gcloud builds submit --tag gcr.io/[PROJECT_ID]/anfaal-next
gcloud run deploy anfaal-next --image gcr.io/[PROJECT_ID]/anfaal-next --platform managed --region asia-south1
```

### Option C: Vercel (Edge Deployment)
Deploying `next-app` directly to Vercel requires zero configuration:
```bash
cd next-app
vercel --prod
```

---

## 7. Zero-Downtime Cutover Plan & Rollback Procedure

### Phase 1: Pre-Cutover Verification (T minus 24 hours)
- [ ] Run `npm run build` in `next-app` to verify all 39 routes compile.
- [ ] Deploy security rules: `firebase deploy --only firestore:rules,storage`.
- [ ] Deploy compound indexes: `firebase deploy --only firestore:indexes`.
- [ ] Execute `npm run migrate:dry-run` to ensure MongoDB connectivity and schema parity.

### Phase 2: Cutover Day (Maintenance Window: 15–30 minutes)
1. **Set Legacy Backend to Read-Only:**
   - Temporarily disable call uploading in legacy Express backend to prevent writes during delta copy.
2. **Execute Final Migration Sync:**
   ```bash
   cd next-app && npm run migrate
   ```
3. **Verify Counts in Firestore Console:**
   - Confirm document counts in `users`, `mentees`, `mentors`, `calls`, `mentorships`, `daily_performances`.
4. **Deploy / Activate Next.js Application:**
   - Point your custom domain (e.g. `app.anfaalfoundation.com`) from the legacy Render URL to the new Next.js production URL.
5. **Set Up Daily Reminder Cron:**
   - Create a Google Cloud Scheduler job (or Vercel Cron):
     - Frequency: Every 15 minutes (`*/15 * * * *`)
     - Target: `POST https://your-domain.com/api/cron/reminders`
     - Header: `x-cron-secret: [CRON_SECRET]`

### Phase 3: Rollback Procedure (In the unlikely event of an issue)
Because the legacy `/frontend` and `/backend` codebases and original MongoDB Atlas cluster remain **100% untouched and preserved**:
1. Change your DNS / CNAME record back to the legacy Render frontend URL.
2. Re-enable write mode on the Express backend.
3. System reverts to the original production state in under 5 minutes with zero data loss.
