import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';

export async function POST(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { endpoint, keys, userAgent } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing subscription endpoint.' }, { status: 400 });
    }

    // Hash endpoint as document key for safe Firestore document ID
    const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');

    const { adminDb } = getFirebaseAdmin();
    await adminDb.collection('push_subscriptions').doc(endpointHash).set({
      userId: authUser.uid,
      endpoint,
      keys: keys || null,
      userAgent: userAgent || req.headers.get('user-agent') || '',
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ message: 'Push subscription registered successfully.' }, { status: 201 });
  } catch (error) {
    console.error('[PushSubscriptionAPI] Error registering push subscription:', error);
    return NextResponse.json({ error: 'Failed to register push subscription.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;

    const { adminDb } = getFirebaseAdmin();
    if (endpoint) {
      const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
      await adminDb.collection('push_subscriptions').doc(endpointHash).delete();
    } else {
      const snap = await adminDb.collection('push_subscriptions').where('userId', '==', authUser.uid).get();
      const batch = adminDb.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    return NextResponse.json({ message: 'Push subscription removed successfully.' });
  } catch (error) {
    console.error('[PushSubscriptionAPI] Error removing push subscription:', error);
    return NextResponse.json({ error: 'Failed to remove push subscription.' }, { status: 500 });
  }
}
