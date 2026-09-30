# Anfaal Smart Mentorship Platform

A production-ready full-stack platform for Anfaal Foundation to manage mentorship sessions, private audio recordings, background AI transcription, automated executive summaries, mentor review/approval workflows, and mentee daily performance tracking.

---

## Architecture Overview

```
Frontend (Vercel)
   │
   │  HTTPS (REST API)
   ▼
Backend API (Render Web Service)
   │
   ├── MongoDB Atlas (Database: Users, Mentors, Mentees, Calls, Mentorships, Performance, Audit Logs)
   │
   ├── AWS S3 Private Bucket (Direct presigned PUT for upload, presigned GET for playback)
   │
   └── Redis (Job Queue: call-processing)
          │
          ▼
   Background Worker (Render Background Worker)
          ├── Fetch audio from S3 (using storageKey)
          ├── Transcribe via OpenAI Whisper
          ├── Summarize via OpenAI GPT
          └── Update MongoDB Call & CallProcessingJob
```

---

## Production Infrastructure Overview

| Component | Target Provider | Service Type / Plan | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel | Production SPA | React 18 + Vite SPA using `VITE_API_URL` pointing to Render API |
| **Backend API** | Render | Web Service | Node.js Express service (`npm start`), zero long-running AI jobs |
| **Background Worker** | Render | Background Worker | Node.js BullMQ worker (`npm run worker`), consumes `call-processing` |
| **Database** | MongoDB Atlas | Cluster M10+ | MongoDB Atlas replica set with indexed collections |
| **Queue / Cache** | Redis / Upstash | Managed Redis | Redis instance for BullMQ queue state (no audio stored) |
| **Storage** | AWS S3 | Private Bucket | Private bucket with presigned PUT upload and presigned GET playback |
| **AI Services** | OpenAI API | Cloud API | Whisper (`whisper-1`) + GPT-4o-mini summarization |

---

## Render Deployment Blueprint (`render.yaml`)

The repository includes a ready-to-use `render.yaml` Blueprint definition:
- **Service 1**: `anfaal-api` (Type: `web`, Build: `npm install && npm run build`, Start: `npm start`, Health check: `/health`)
- **Service 2**: `anfaal-worker` (Type: `worker`, Build: `npm install && npm run build`, Start: `npm run worker`)

---

## Environment Variables

The following environment variables must be configured on **BOTH** Render services (`anfaal-api` and `anfaal-worker`), with frontend configuring only `VITE_API_URL`:

```env
# ----------------------------------------------------
# General Configuration
# ----------------------------------------------------
NODE_ENV=production
PORT=10000
CLIENT_URL=https://YOUR-VERCEL-DOMAIN.vercel.app

# ----------------------------------------------------
# Security & Auth (API requires, Worker inherits)
# ----------------------------------------------------
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d

# ----------------------------------------------------
# Database (MongoDB Atlas)
# ----------------------------------------------------
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/anfaal_production?retryWrites=true&w=majority

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

# ----------------------------------------------------
# AI Services (OpenAI API)
# ----------------------------------------------------
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_MODEL=gpt-4o-mini
```

> **IMPORTANT SECURITY NOTE**: Never expose `AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, or `JWT_SECRET` in the frontend or in client builds. Only `VITE_API_URL` is set on Vercel.

---

## 20-Step Render & Production Deployment Sequence

Follow these exact steps to deploy the production architecture:

### STEP 1: Create MongoDB Atlas Database
- Create an Atlas cluster (e.g. `M10` or serverless) in the same geographic region as your Render services.
- Under **Network Access**, whitelist Render egress IPs or `0.0.0.0/0` with strong database user credentials.
- Under **Database Access**, create a user with read/write privileges on `anfaal_production`.
- Copy the SRV URI: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/anfaal_production?retryWrites=true&w=majority`.

### STEP 2: Create Private AWS S3 Bucket
- Create a bucket in AWS S3 (e.g. `anfaal-call-recordings-prod`).
- **Keep "Block all public access" ENABLED**. The bucket must remain completely private.
- Configure S3 CORS to allow direct frontend uploads:
  ```json
  [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": [
        "https://mentorship.vercel.app",
        "https://YOUR-DOMAIN.com"
      ],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
- Create an IAM policy with `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on `arn:aws:s3:::anfaal-call-recordings-prod/*`.
- Generate an IAM Access Key and Secret Key.
- Set `AWS_REGION` to the bucket's actual region. S3 CORS origins must be exact: add every deployed frontend origin, including `https://mentorship.vercel.app`. Missing origins cause the browser's direct PUT to fail with HTTP 403 even when presigning succeeds.

### STEP 3: Create / Configure Redis
- Create a managed Redis instance (e.g. Render Redis, Upstash Redis, or Redis Cloud).
- Obtain the connection URL: `rediss://default:<password>@<host>:<port>` or `redis://...`.

### STEP 4: Create Render Web Service for API
- In Render Dashboard, click **New > Web Service** and connect this repository.
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`

### STEP 5: Create Render Background Worker
- In Render Dashboard, click **New > Background Worker** and connect the same repository.
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm run worker`

### STEP 6: Add Environment Variables to BOTH Render Services
Add all required environment variables to both `anfaal-api` and `anfaal-worker`:
- `NODE_ENV=production`
- `MONGODB_URI=<Atlas connection string>`
- `JWT_SECRET=<strong 32+ char secret>`
- `CLIENT_URL=https://YOUR-VERCEL-DOMAIN.vercel.app` (on API)
- `REDIS_URL=<Redis connection URL>`
- `AWS_REGION=<your AWS region>`
- `AWS_ACCESS_KEY_ID=<AWS key ID>`
- `AWS_SECRET_ACCESS_KEY=<AWS secret>`
- `STORAGE_BUCKET=<S3 bucket name>`
- `OPENAI_API_KEY=<OpenAI API key>`
- `OPENAI_TRANSCRIPTION_MODEL=whisper-1`

### STEP 7: Deploy API
- Trigger deployment of `anfaal-api`.
- Wait for Render build to succeed and verify startup logs:
  `[API Service] Anfaal API running on port 10000 (env: production)`.

### STEP 8: Deploy Worker
- Trigger deployment of `anfaal-worker`.
- Wait for Render build to succeed and verify worker startup logs:
  `[Worker Service] BullMQ call worker is active and listening to queue: call-processing`.

### STEP 9: Verify Health Check Endpoints
- Make a GET request to the deployed API:
  `curl -i https://YOUR-RENDER-API.onrender.com/health`
  Response: `200 OK {"status":"ok","service":"anfaal-api",...}`
- Test readiness:
  `curl -i https://YOUR-RENDER-API.onrender.com/health/ready`
  Response: `200 OK {"status":"ready","database":"connected","queue":"connected",...}`

### STEP 10: Deploy Frontend to Vercel
- In Vercel, import the repository and select `frontend` as the root directory.
- Set framework preset to **Vite**.

### STEP 11: Set Frontend Environment Variable on Vercel
- In Vercel Project Settings > Environment Variables:
  `VITE_API_URL=https://YOUR-RENDER-API.onrender.com/api`
- Redeploy the frontend.

### STEP 12: Set Render CLIENT_URL
- In the Render Web Service settings, set `CLIENT_URL` to your Vercel URL (e.g. `https://anfaal-mentorship.vercel.app`).
- This configures CORS so only your Vercel domain can interact with the API.

### STEP 13: Test Authentication
- Navigate to the Vercel app and log in with your admin or mentor credentials.
- Verify JWT is returned, stored in `localStorage`, and subsequent requests include Bearer token.

### STEP 14: Test Call Upload
- As a mentor, create a call session and attach an audio recording (`.m4a`, `.mp3`, `.wav`).
- Verify the frontend requests `POST /api/calls/presign-upload` and receives a presigned PUT URL.

### STEP 15: Test S3 Recording
- Verify the audio file uploads directly from the browser to the private S3 bucket.
- Verify the object key in S3 matches `calls/YYYY/MM/call_<uuid>/<filename>`.

### STEP 16: Test BullMQ Processing
- Verify the frontend calls `POST /api/calls/complete-upload`.
- Verify the API creates a `Call` and `CallProcessingJob` and enqueues to `call-processing`.
- Check Render Background Worker logs to confirm it consumes the job.

### STEP 17: Test Transcription
- Confirm the worker downloads the audio stream from private S3 using AWS SDK.
- Confirm Whisper transcribes the recording into speaker-labeled, timestamped segments.

### STEP 18: Test AI Summary
- Confirm the worker sends the transcript to OpenAI GPT.
- Confirm structured summary, key discussion points, achievements, challenges, and action items are saved to MongoDB.

### STEP 19: Test Mentor Approval
- Open the call detail in the mentor dashboard.
- Verify playback uses `GET /api/calls/:id/audio-url` which returns a short-lived signed S3 URL.
- Edit summary or action items and click **Approve Summary**.
- Verify status changes to `Approved` and audit log is recorded.

### STEP 20: Test Daily Performance
- As a mentee, submit a daily performance entry (study minutes, Quran reading, reflection).
- As a mentor or admin, open the mentee profile and verify performance entries and trends are displayed.

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

