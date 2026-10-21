import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { adminDb } = getFirebaseAdmin();
    const snap = await adminDb
      .collection('notifications')
      .where('userId', '==', authUser.uid)
      .where('read', '==', false)
      .get();

    return NextResponse.json({ unreadCount: snap.size });
  } catch (error) {
    console.error('[UnreadCountAPI] Error counting unread notifications:', error);
    return NextResponse.json({ error: 'Failed to count unread notifications.' }, { status: 500 });
  }
}
