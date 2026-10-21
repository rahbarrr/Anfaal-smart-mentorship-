import 'server-only';
import * as admin from 'firebase-admin';

// Server-side Singleton for Firebase Admin SDK
function initAdmin(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    // Handle escaped newlines in environment variable strings
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // If running against local Firebase emulator
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return admin.initializeApp({
      projectId: projectId || 'demo-anfaal',
    });
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[FirebaseAdmin] Missing server credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.',
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export function getFirebaseAdmin() {
  const adminApp = initAdmin();
  const adminAuth = admin.auth(adminApp);
  const adminDb = admin.firestore(adminApp);
  const adminStorage = admin.storage(adminApp);

  return { adminApp, adminAuth, adminDb, adminStorage };
}
