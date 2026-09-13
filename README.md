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

For production deployment:

1. Set environment variables securely.
2. Use a managed MongoDB instance.
3. Host the frontend with Vercel/Netlify or a static hosting provider.
4. Host the API on a Node-compatible environment such as Render, Railway, or AWS.
5. Configure object storage for recordings and signed URL access controls.
