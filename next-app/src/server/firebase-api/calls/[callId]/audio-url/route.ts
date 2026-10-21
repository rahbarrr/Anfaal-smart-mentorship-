import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getStorageService } from '@/lib/services/storageService';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { callId } = await params;
  if (!callId) {
    return NextResponse.json({ error: 'Missing callId.' }, { status: 400 });
  }

  const { adminDb } = getFirebaseAdmin();
  const callDoc = await adminDb.collection('calls').doc(callId).get();

  if (!callDoc.exists) {
    return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
  }

  const callData = callDoc.data()!;

  // Authorization check: Admin, Mentor who owns the call, or Mentee of the call
  const isAuthorized =
    authUser.role === 'ADMIN' ||
    (authUser.role === 'MENTOR' && String(callData.mentorId) === authUser.uid) ||
    (authUser.role === 'MENTEE' && String(callData.menteeId) === authUser.menteeId);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden. You do not have access to this recording.' }, { status: 403 });
  }

  const storageKey = callData.recording?.storageKey || callData.storageKey;
  if (!storageKey) {
    return NextResponse.json({ error: 'No recording file found for this call.' }, { status: 404 });
  }

  try {
    const storageService = getStorageService();
    const signedUrl = await storageService.getSignedDownloadUrl(storageKey, 3600); // 1 hour

    return NextResponse.json({
      audioUrl: signedUrl,
      expiresInSeconds: 3600,
    });
  } catch (error) {
    console.error('[AudioUrlAPI] Error generating signed playback URL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate audio playback URL.' },
      { status: 500 },
    );
  }
}
