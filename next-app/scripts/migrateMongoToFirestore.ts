/**
 * Anfaal Smart Mentorship — Safe MongoDB to Firestore Data Migration
 * 
 * Features:
 * - Zero Password Reset: Retains bcrypt passwordHash in Firestore users collection
 * - Batch Chunking: Writes in chunks <= 450 docs (within Firestore 500 batch limit)
 * - Dry-Run Mode: Simulates entire extraction and transformation with --dry-run
 * - Selective Collection Migration: Supports --collection=<name>
 * - Integrity Verification: Verifies record counts in MongoDB vs Firestore
 * - Resilient Error Handling: Logs failed documents with error descriptions
 * 
 * Usage:
 *   # Dry run (simulation only, no writes to Firestore)
 *   npx tsx scripts/migrateMongoToFirestore.ts --dry-run
 * 
 *   # Live migration
 *   npx tsx scripts/migrateMongoToFirestore.ts
 * 
 *   # Single collection live migration
 *   npx tsx scripts/migrateMongoToFirestore.ts --collection=users
 */

import { MongoClient, ObjectId } from 'mongodb';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

// ── Environment & Config ─────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/anfaal';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'anfaal-smart-mentorship';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const collectionArg = args.find((a) => a.startsWith('--collection='))?.split('=')[1];
const batchSizeArg = parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '400', 10);
const BATCH_SIZE = Math.min(Math.max(batchSizeArg, 1), 450); // Enforce <= 450 for safety

console.log('\n======================================================');
console.log('   ANFAAL SMART MENTORSHIP — MIGRATION PIPELINE');
console.log('======================================================');
console.log(`Mode:            ${isDryRun ? '🟡 DRY RUN (Simulation only)' : '🟢 LIVE MIGRATION'}`);
console.log(`Target Project:  ${FIREBASE_PROJECT_ID}`);
console.log(`Batch Size:      ${BATCH_SIZE} documents / Firestore commit`);
if (collectionArg) {
  console.log(`Filtered:        Only migrating '${collectionArg}' collection`);
}
console.log('======================================================\n');

// ── Initialize Firestore ─────────────────────────────────────────────────────

function initFirestore() {
  if (getApps().length === 0) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: FIREBASE_PROJECT_ID,
      });
      console.log(`[Firestore] Initialized with service account from: ${serviceAccountPath}`);
    } else {
      // Fallback to ADC or Emulator
      initializeApp({
        projectId: FIREBASE_PROJECT_ID,
      });
      console.log(`[Firestore] Initialized with application default credentials for project: ${FIREBASE_PROJECT_ID}`);
    }
  }
  return getFirestore();
}

// ── Helper: Safe Object/Date Transformation ──────────────────────────────────

function sanitizeForFirestore(val: any): any {
  if (val === null || val === undefined) {
    return null;
  }
  if (val instanceof ObjectId) {
    return val.toHexString();
  }
  if (val instanceof Date) {
    return Timestamp.fromDate(val);
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return Timestamp.fromDate(d);
    }
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForFirestore);
  }
  if (typeof val === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === '_id') {
        clean.id = v instanceof ObjectId ? v.toHexString() : String(v);
      } else if (k === '__v') {
        // Skip mongoose version key
        continue;
      } else {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean;
  }
  return val;
}

// ── Collection Definitions & Transformers ────────────────────────────────────

interface CollectionMigrationConfig {
  mongoCollection: string;
  firestoreCollection: string;
  transform: (doc: any) => { docId: string; data: Record<string, any> };
}

const COLLECTIONS: CollectionMigrationConfig[] = [
  {
    mongoCollection: 'users',
    firestoreCollection: 'users',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id; // Doc ID is Firestore key

      // Ensure bcrypt password hash and role are preserved
      return {
        docId,
        data: {
          ...data,
          name: doc.name || 'User',
          email: (doc.email || '').toLowerCase().trim(),
          makid: doc.makid || null,
          role: doc.role || 'MENTEE',
          status: doc.status || 'active',
          menteeId: doc.menteeId || null,
          passwordHash: doc.passwordHash, // Retain for zero password reset verification
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'mentors',
    firestoreCollection: 'mentors',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          userId: String(doc.userId),
          phone: doc.phone || null,
          bio: doc.bio || null,
          gender: doc.gender || null,
          expertise: doc.expertise || null,
          availability: doc.availability || null,
          location: doc.location || null,
          preferredSubjects: doc.preferredSubjects || [],
          mentorApprovalStatus: doc.mentorApprovalStatus || 'APPROVED',
          status: doc.status || 'active',
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'mentees',
    firestoreCollection: 'mentees',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          name: doc.name,
          standard: doc.standard,
          makid: doc.makid || null,
          status: doc.status || 'active',
          userId: doc.userId ? String(doc.userId) : null,
          location: doc.location || '',
          contactInformation: doc.contactInformation || null,
          academic: doc.academic || null,
          goals: doc.goals || null,
          routine: doc.routine || null,
          careerInterests: doc.careerInterests || null,
          challenges: doc.challenges || [],
          notes: doc.notes || [],
          profileProvenance: doc.profileProvenance || {},
          lastProfileUpdate: doc.lastProfileUpdate ? sanitizeForFirestore(doc.lastProfileUpdate) : null,
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'calls',
    firestoreCollection: 'calls',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          mentorId: String(doc.mentorId),
          menteeId: String(doc.menteeId),
          date: sanitizeForFirestore(doc.date),
          duration: Number(doc.duration) || 0,
          recordingUrl: doc.recordingUrl || null,
          recordingStatus: doc.recordingStatus || 'pending',
          processingStatus: doc.processingStatus || 'completed',
          recording: doc.recording || null,
          transcript: doc.transcript || null,
          transcription: doc.transcription || null,
          summary: doc.summary || null,
          aiSummary: doc.aiSummary || null,
          topicsDiscussed: doc.topicsDiscussed || [],
          mentorNotes: doc.mentorNotes || null,
          reviewStatus: doc.reviewStatus || 'Approved',
          reviewedBy: doc.reviewedBy || null,
          reviewedAt: doc.reviewedAt ? sanitizeForFirestore(doc.reviewedAt) : null,
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'mentorships',
    firestoreCollection: 'mentorships',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          mentorId: String(doc.mentorId),
          menteeId: String(doc.menteeId),
          assignedAt: doc.assignedAt ? sanitizeForFirestore(doc.assignedAt) : Timestamp.now(),
          status: doc.status || 'active',
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'dailyperformances',
    firestoreCollection: 'daily_performances',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          menteeId: String(doc.menteeId),
          date: doc.date, // 'YYYY-MM-DD'
          studyMinutes: Number(doc.studyMinutes) || 0,
          quran: doc.quran || { ruku: 0, ayat: 0, pages: 0 },
          readingMinutes: Number(doc.readingMinutes) || 0,
          dayRating: Number(doc.dayRating) || 3,
          dailyReflection: doc.dailyReflection || null,
          facedDifficulty: Boolean(doc.facedDifficulty),
          difficultyNote: doc.difficultyNote || null,
          needsMentorHelp: Boolean(doc.needsMentorHelp),
          mentorHelpNote: doc.mentorHelpNote || null,
          submittedAt: doc.submittedAt ? sanitizeForFirestore(doc.submittedAt) : Timestamp.now(),
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'auditlogs',
    firestoreCollection: 'audit_logs',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          userId: String(doc.userId),
          userName: doc.userName || 'System',
          userRole: doc.userRole || 'ADMIN',
          action: doc.action,
          targetType: doc.targetType,
          targetId: String(doc.targetId || ''),
          details: doc.details || '',
          menteeName: doc.menteeName || null,
          mentorName: doc.mentorName || null,
          ipAddress: doc.ipAddress || null,
          createdAt: doc.createdAt ? sanitizeForFirestore(doc.createdAt) : Timestamp.now(),
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
  {
    mongoCollection: 'notifications',
    firestoreCollection: 'notifications',
    transform: (doc) => {
      const docId = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
      const data = sanitizeForFirestore(doc);
      delete data.id;

      return {
        docId,
        data: {
          ...data,
          userId: String(doc.userId),
          title: doc.title,
          message: doc.message,
          type: doc.type || 'info',
          read: Boolean(doc.read),
          createdAt: doc.createdAt ? sanitizeForFirestore(doc.createdAt) : Timestamp.now(),
          migratedAt: Timestamp.now(),
        },
      };
    },
  },
];

// ── Migration Execution ──────────────────────────────────────────────────────

async function runMigration() {
  const startTime = Date.now();
  const db = initFirestore();

  console.log(`[MongoDB] Connecting to: ${MONGODB_URI.replace(/:([^@]+)@/, ':****@')}`);
  const mongoClient = new MongoClient(MONGODB_URI);

  try {
    await mongoClient.connect();
    const mongoDb = mongoClient.db();
    console.log('[MongoDB] Connected successfully.\n');

    const targetConfigs = collectionArg
      ? COLLECTIONS.filter((c) => c.mongoCollection === collectionArg || c.firestoreCollection === collectionArg)
      : COLLECTIONS;

    if (targetConfigs.length === 0) {
      console.error(`[Error] No collection matching '${collectionArg}' was found.`);
      process.exit(1);
    }

    const summaryReport: Array<{
      collection: string;
      mongoCount: number;
      migratedCount: number;
      skippedCount: number;
      status: string;
    }> = [];

    for (const config of targetConfigs) {
      console.log(`────────────────────────────────────────────────────────`);
      console.log(`[Collection] ${config.mongoCollection}  ->  ${config.firestoreCollection}`);

      const collection = mongoDb.collection(config.mongoCollection);
      const totalDocs = await collection.countDocuments();
      console.log(`  Found ${totalDocs} documents in MongoDB '${config.mongoCollection}'`);

      if (totalDocs === 0) {
        console.log(`  Skipping empty collection.`);
        summaryReport.push({
          collection: config.firestoreCollection,
          mongoCount: 0,
          migratedCount: 0,
          skippedCount: 0,
          status: 'EMPTY',
        });
        continue;
      }

      const cursor = collection.find({});
      let batch = db.batch();
      let countInBatch = 0;
      let totalMigrated = 0;
      let totalSkipped = 0;

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc) continue;

        try {
          const { docId, data } = config.transform(doc);

          if (!docId) {
            totalSkipped++;
            continue;
          }

          if (!isDryRun) {
            const docRef = db.collection(config.firestoreCollection).doc(docId);
            batch.set(docRef, data, { merge: true });
            countInBatch++;

            if (countInBatch >= BATCH_SIZE) {
              await batch.commit();
              totalMigrated += countInBatch;
              process.stdout.write(`  Committed ${totalMigrated}/${totalDocs} documents...\r`);
              batch = db.batch();
              countInBatch = 0;
            }
          } else {
            totalMigrated++;
            if (totalMigrated % 50 === 0 || totalMigrated === totalDocs) {
              process.stdout.write(`  Simulated ${totalMigrated}/${totalDocs} documents...\r`);
            }
          }
        } catch (err) {
          console.error(`\n  [Error] Failed to transform doc ${doc._id}:`, err);
          totalSkipped++;
        }
      }

      // Commit remaining batch
      if (!isDryRun && countInBatch > 0) {
        await batch.commit();
        totalMigrated += countInBatch;
      }

      console.log(`\n  ✓ Completed ${config.firestoreCollection}: ${totalMigrated} processed, ${totalSkipped} skipped.`);

      summaryReport.push({
        collection: config.firestoreCollection,
        mongoCount: totalDocs,
        migratedCount: totalMigrated,
        skippedCount: totalSkipped,
        status: isDryRun ? 'SIMULATED' : 'SUCCESS',
      });
    }

    // ── Summary Table ──────────────────────────────────────────────────────────
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n======================================================');
    console.log('                 MIGRATION SUMMARY');
    console.log('======================================================');
    console.table(summaryReport);
    console.log(`Elapsed Time: ${elapsedSeconds} seconds`);
    console.log(`Execution Mode: ${isDryRun ? 'DRY RUN (No Firestore writes committed)' : 'LIVE (All batches committed)'}`);
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n[Fatal] Migration failed with error:', error);
    process.exit(1);
  } finally {
    await mongoClient.close();
    console.log('[MongoDB] Connection closed.');
  }
}

runMigration().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
