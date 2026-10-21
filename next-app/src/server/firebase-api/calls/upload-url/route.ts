import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getStorageService } from '@/lib/services/storageService';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser || (authUser.role !== 'ADMIN' && authUser.role !== 'MENTOR')) {
    return NextResponse.json({ error: 'Unauthorized. Mentor or Admin role required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { callId, fileName, mimeType } = body;

    if (!callId || !fileName || !mimeType) {
      return NextResponse.json({ error: 'Missing callId, fileName, or mimeType.' }, { status: 400 });
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `recordings/${callId}/${Date.now()}_${cleanFileName}`;

    const storageService = getStorageService();
    const uploadUrl = await storageService.getSignedUploadUrl(storageKey, mimeType, 900); // 15 mins

    // Update call doc with recording placeholder
    const { adminDb } = getFirebaseAdmin();
    await adminDb.collection('calls').doc(callId).set(
      {
        recordingStatus: 'pending',
        storageKey,
        recording: {
          storageKey,
          fileName: cleanFileName,
          mimeType,
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    return NextResponse.json({
      uploadUrl,
      storageKey,
      expiresInSeconds: 900,
    });
  } catch (error) {
    console.error('[UploadUrlAPI] Error generating signed upload URL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate upload URL.' },
      { status: 500 },
    );
  }
}
