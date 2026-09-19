# Anfaal Mentorship Management Platform

A production-ready full-stack platform for Anfaal Foundation to manage mentorship sessions, recordings, AI transcription, summaries, and reporting.

## Overview

This repository includes:

- React + TypeScript frontend with a dashboard oriented around the Anfaal Foundation design language
- Express + TypeScript backend with REST API architecture
- MongoDB + Mongoose models and schema definitions
- Authentication and authorization structure for ADMIN and MENTOR roles
- AI and file-storage abstraction layers for future integrations
- Mock seed and demo data for local development

## Project structure

```bash
.
├── frontend
│   ├── src
│   ├── package.json
│   └── vite.config.ts
├── backend
│   ├── src
│   ├── package.json
│   └── tsconfig.json
├── README.md
└── .gitignore
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

## Environment variables

Copy the sample file and update values:

```bash
cp backend/.env.example backend/.env
```

Required values:

- MONGODB_URI
- JWT_SECRET
- PORT
- STORAGE_PROVIDER
- STORAGE_BUCKET
- STORAGE_ACCESS_KEY
- STORAGE_SECRET_KEY
- TRANSCRIPTION_API_KEY
- AI_API_KEY
- NODE_ENV
- ADMIN_PASSWORD

## Seed admin account

```bash
cd backend
npm run seed
```

Default admin login:

- Email: admin@anfaalfoundation.com
- Password: Admin@123 (or set ADMIN_PASSWORD in the environment)

## API endpoints

- GET /api/health
- POST /api/auth/login
- GET /api/mentors
- GET /api/mentees
- GET /api/calls
- POST /api/calls/upload
- GET /api/admin/dashboard-summary

## Production notes

- Keep private recordings behind authenticated access policies.
- Use secure storage providers with signed URLs and authorization checks.
- Replace the mock transcription and AI services with real provider integrations.
- Use environment variables for all secrets and API keys.

## Deployment

The repository includes a production Docker Compose configuration. Before the
first deployment, create the production environment file and replace every
placeholder with a unique, private value:

```bash
cp backend/.env.production.example backend/.env.production
```

Set `CLIENT_URL` to the final HTTPS domain and use a long random `JWT_SECRET`.
Set the one-time bootstrap administrator email and password, then start the
stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The application will be available at `http://YOUR_SERVER_IP:8080` by default.
For a public deployment, place a TLS reverse proxy (such as Caddy or Nginx) in
front of port 8080 and use HTTPS. MongoDB and the API are intentionally not
exposed to the public internet. After signing in for the first time, remove
`BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from
`backend/.env.production` and restart the backend.

For managed hosting, use MongoDB Atlas for the database and set its connection
string as `MONGODB_URI`. Configure an authenticated object-storage provider
before storing real call recordings.

### Vercel deployment

Deploy `backend` and `frontend` as two separate Vercel projects from this
repository. Create the backend project first and set these Vercel environment
variables: `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`,
`CLIENT_URL`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD`.
Use MongoDB Atlas for `MONGODB_URI`; Vercel does not provide a persistent
MongoDB service.

After Vercel provides the backend URL, set the frontend project environment
variable `VITE_API_URL` to `https://YOUR-BACKEND.vercel.app/api` and set the
backend `CLIENT_URL` to the frontend's Vercel URL. Redeploy the frontend after
adding that value.
