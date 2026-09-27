# Anfaal Smart Mentorship Platform

A production-ready full-stack platform for Anfaal Foundation to manage mentorship sessions, private audio recordings, background AI transcription, automated executive summaries, mentor review/approval workflows, and mentee daily performance tracking.

---

## Architecture Overview

```
Frontend (Vercel)
   │
   │  HTTPS (REST + Presigned S3 URLs)
   ▼
Backend API (Railway / Docker Node service)
   │
   ├── MongoDB Atlas (Database: Users, Calls, Mentorships, Performance, Audit Logs)
   │
   ├── AWS S3 Private Bucket (Direct presigned PUT for upload, presigned GET for playback)
   │
   └── Redis (Job Queue: call-processing)
          │
          ▼
   Background Worker (Railway / Docker Node service)
          ├── Fetch audio from S3 (using storageKey)
          ├── Transcribe via OpenAI Whisper
          ├── Summarize via OpenAI GPT
          └── Update MongoDB Call & CallProcessingJob
```

---

## Repository Structure

```bash
.
├── frontend/                     # React 18 + TypeScript + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/           # UI components, audio player, modals
│   │   ├── pages/                # Admin, Mentor, Mentee dashboards, Call intelligence
│   │   └── lib/api.ts            # Client API layer with direct S3 upload handling
│   ├── package.json
│   └── vite.config.ts
├── backend/                      # Node.js + Express + TypeScript + BullMQ
│   ├── src/
│   │   ├── config/               # Environment validation & DB connections
│   │   ├── models/               # Mongoose models with production indexes
│   │   ├── queue/                # BullMQ queue & call worker processor
│   │   ├── routes/               # Hardened API endpoints & authorization
│   │   ├── services/             # Storage (S3), Transcription, AI summary, Seed
│   │   ├── tests/                # Automated integration test suite
│   │   ├── server.ts             # Express HTTP API entry point
│   │   └── worker.ts             # Dedicated background worker entry point
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml            # Local development orchestration with Redis & Mongo
├── docker-compose.prod.yml       # Production multi-service container orchestration
└── README.md
```

---

## Production Infrastructure Requirements

| Component | Target Provider | Description |
| :--- | :--- | :--- |
| **Frontend** | Vercel | Single-Page Application (SPA) with rewrite rules for client routing |
| **Backend API** | Railway / AWS ECS | Persistent Node.js Express service handling auth, uploads, metadata |
| **Worker** | Railway / AWS ECS | Persistent Node.js worker running BullMQ (`npm run worker:prod`) |
| **Database** | MongoDB Atlas | M10+ replica set with SSL connection string |
| **Queue / Cache** | Upstash / Redis Cloud | Redis 6+ instance (persisted) for BullMQ background queues |
| **Storage** | AWS S3 | Dedicated private S3 bucket with strict block public access |
| **AI Services** | OpenAI API | Whisper (`whisper-1`) for speech-to-text, GPT-4o-mini for summaries |

---

## Environment Variables

### Backend (`backend/.env`)

```env
# ----------------------------------------------------
# General Configuration
# ----------------------------------------------------
NODE_ENV=production
PORT=5001
CLIENT_URL=https://mentorship.anfaalfoundation.com

# ----------------------------------------------------
# Security & Auth
# ----------------------------------------------------
# 32+ character high-entropy secret
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d

# ----------------------------------------------------
# Database
# ----------------------------------------------------
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/anfaal_production?retryWrites=true&w=majority

# ----------------------------------------------------
# Redis / BullMQ Queue
# ----------------------------------------------------
REDIS_URL=rediss://default:<password>@<host>:<port>

# ----------------------------------------------------
# AWS S3 Storage (Private Call Recordings)
# ----------------------------------------------------
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
STORAGE_BUCKET=anfaal-call-recordings-production
# Presigned URL expiry in seconds (default: 3600 = 1 hour)
PRESIGNED_URL_EXPIRES_IN=3600

# ----------------------------------------------------
# AI Services (OpenAI)
# ----------------------------------------------------
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_MODEL=gpt-4o-mini
# NOTE: Set to true ONLY in dev/testing environments without OpenAI access:
ALLOW_MOCK_TRANSCRIPTION=false
ALLOW_MOCK_AI=false

# ----------------------------------------------------
# Initial Bootstrap Admin (Initial Setup Only)
# ----------------------------------------------------
BOOTSTRAP_ADMIN_EMAIL=admin@anfaalfoundation.com
BOOTSTRAP_ADMIN_PASSWORD=StrongP@ssw0rd!2026
DISABLE_BOOTSTRAP_ADMIN=false
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=https://api-mentorship.anfaalfoundation.com/api
```

---

## Step-by-Step Deployment Guide

### 1. MongoDB Atlas Setup
1. Create a MongoDB Atlas cluster (M0 free tier for staging or M10+ for production).
2. Under **Network Access**, allow the IP addresses of your Railway API, Worker, or enable `0.0.0.0/0` with strong database user credentials.
3. Under **Database Access**, create a user with `readWrite` permissions on `anfaal_production`.
4. Copy the connection string (SRV URI) and assign to `MONGODB_URI`.
5. Production indexes (on `Call`, `User`, `Mentorship`, `AuditLog`, `DailyPerformance`) are automatically verified and built on application startup.

### 2. AWS S3 Setup (Private Bucket)
1. In the AWS S3 Console, create a new bucket (e.g., `anfaal-call-recordings-production`).
2. **Block Public Access**: Keep **"Block all public access"** CHECKED (bucket must remain private).
3. **CORS Configuration**: Configure CORS on the S3 bucket to allow direct browser uploads via presigned URLs:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedOrigins": [
         "https://mentorship.anfaalfoundation.com",
         "http://localhost:5173"
       ],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **IAM Policy**: Create an IAM user with programmatic access containing this minimum policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::anfaal-call-recordings-production/*"
       }
     ]
   }
   ```
5. Store the Access Key and Secret Key in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### 3. Redis Setup
1. Provision a Redis instance (e.g., Upstash Redis or Railway Redis plugin).
2. Copy the connection URI (e.g., `rediss://default:...@...:6379`).
3. Set `REDIS_URL` in both Backend API and Worker services.

### 4. Railway API Deployment
1. Connect your GitHub repository to Railway.
2. Select the `backend` folder as the root directory.
3. Set the build command to `npm run build`.
4. Set the start command to `npm start` (or `node dist/server.js`).
5. Configure all environment variables listed above under Backend Configuration.
6. Generate a public domain (e.g., `https://api-mentorship.up.railway.app`).

### 5. Railway Worker Deployment
1. Add a second service from the same GitHub repository in Railway.
2. Select the `backend` folder as the root directory.
3. Set the build command to `npm run build`.
4. Set the start command to `npm run worker:prod` (or `node dist/worker.js`).
5. Add the exact same environment variables (`MONGODB_URI`, `REDIS_URL`, `AWS_*`, `STORAGE_BUCKET`, `OPENAI_*`).
6. *Note*: Do NOT expose any HTTP port or public domain for the worker; it runs purely as a background BullMQ consumer.

### 6. Vercel Frontend Deployment
1. Import the repository into Vercel.
2. Set the root directory to `frontend`.
3. Set the framework preset to **Vite**.
4. Configure the environment variable:
   - `VITE_API_URL`: `https://api-mentorship.up.railway.app/api`
5. Deploy.
6. Copy the assigned Vercel URL (e.g., `https://anfaal-mentorship.vercel.app`) and update the backend's `CLIENT_URL` variable to match.

---

## Admin Bootstrap & Safety

Initial administrator credentials can be configured using:
```env
BOOTSTRAP_ADMIN_EMAIL=admin@anfaalfoundation.com
BOOTSTRAP_ADMIN_PASSWORD=StrongP@ssw0rd!2026
```

**Security Rules**:
1. In production, `BOOTSTRAP_ADMIN_PASSWORD` must be at least 12 characters and contain uppercase, lowercase, numbers, and special characters.
2. Passwords are never logged or returned to the client.
3. After the initial deployment and successful login, set:
   ```env
   DISABLE_BOOTSTRAP_ADMIN=true
   ```
   Or remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the production environment variables to prevent future execution.

---

## Call Recording Lifecycle & Storage Flow

```
1. Mentor uploads audio on Frontend
   ├── Frontend calls POST /api/calls/presign-upload (validates auth, MIME, size)
   ├── Backend generates unique storageKey: calls/YYYY/MM/call_<uuid>/recording.m4a
   └── Backend returns presigned S3 PUT URL (60-minute window)

2. Frontend uploads directly to AWS S3
   ├── Upload bypasses Express server (zero memory bottleneck)
   └── Real-time progress bar displayed to user

3. Frontend confirms upload
   ├── Frontend calls POST /api/calls/complete-upload with storageKey & metadata
   ├── Call record created in MongoDB
   ├── Job created in CallProcessingJob and enqueued to BullMQ
   └── API returns immediately (processing occurs asynchronously)

4. Worker processes call in background
   ├── Worker claims job from BullMQ queue
   ├── Fetches binary stream from S3 using storageKey
   ├── Whisper transcribes audio
   ├── GPT-4o-mini generates structured summary & action items
   ├── MongoDB Call is updated with transcript and AI analysis
   └── If AI fails, transcript is saved and status marked FAILED (ready for retry)

5. Mentor review and playback
   ├── Audio player requests GET /api/calls/:id/audio-url
   ├── Backend validates mentor/admin permissions (rejects mentees)
   ├── Generates short-lived presigned S3 GET URL (1 hour)
   ├── Mentor can edit transcript/summary and click "Approve"
   └── Approving locks version and records audit event SUMMARY_APPROVED
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- Docker and Docker Compose (for MongoDB and Redis)

```bash
# 1. Start MongoDB and Redis containers
docker compose up -d

# 2. Start Backend API
cd backend
npm install
npm run dev

# 3. Start Background Worker (separate terminal)
cd backend
npm run worker

# 4. Start Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
cd backend
npm test
```

All 24 automated unit and integration tests run against mockable providers, verifying:
- Authentication, role enforcement, and token expiry
- Direct upload presigning, completion, and call deletion
- Presigned audio URL generation and playback authorization
- Mentee access restrictions (403 Forbidden on audio/transcript)
- Processing success, transcription failure, and AI summary fallback
- Safe retry flow avoiding re-transcription
- Mentorship and bulk CSV import validation
