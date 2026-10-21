import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing notification id.' }, { status: 400 });
  }

  try {
    const { adminDb } = getFirebaseAdmin();
    const docRef = adminDb.collection('notifications').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.userId !== authUser.uid) {
      return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
    }

    await docRef.update({ read: true });

    const unreadSnap = await adminDb
      .collection('notifications')
      .where('userId', '==', authUser.uid)
      .where('read', '==', false)
      .get();

    return NextResponse.json({
      message: 'Notification marked as read.',
      notification: { id, read: true },
      unreadCount: unreadSnap.size,
    });
  } catch (error) {
    console.error('[MarkReadAPI] Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification.' }, { status: 500 });
  }
}
