import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 100);

  try {
    const { adminDb } = getFirebaseAdmin();
    let query = adminDb.collection('notifications').where('userId', '==', authUser.uid);

    if (unreadOnly) {
      query = query.where('read', '==', false);
    }

    const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
    const notifications = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type || 'info',
        category: data.category || 'general',
        title: data.title || '',
        message: data.message || '',
        link: data.link || null,
        read: Boolean(data.read),
        metadata: data.metadata || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      };
    });

    const unreadSnap = await adminDb
      .collection('notifications')
      .where('userId', '==', authUser.uid)
      .where('read', '==', false)
      .get();

    return NextResponse.json({
      notifications,
      unreadCount: unreadSnap.size,
    });
  } catch (error) {
    console.error('[NotificationsAPI] Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications.' }, { status: 500 });
  }
}
