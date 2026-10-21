import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

export async function PATCH(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { adminDb } = getFirebaseAdmin();
    const unreadSnap = await adminDb
      .collection('notifications')
      .where('userId', '==', authUser.uid)
      .where('read', '==', false)
      .get();

    const batch = adminDb.batch();
    unreadSnap.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });
    await batch.commit();

    return NextResponse.json({
      message: 'All notifications marked as read.',
      unreadCount: 0,
    });
  } catch (error) {
    console.error('[ReadAllAPI] Error marking all notifications as read:', error);
    return NextResponse.json({ error: 'Failed to mark notifications as read.' }, { status: 500 });
  }
}
