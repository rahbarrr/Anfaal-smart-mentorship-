import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const DEFAULT_PREFERENCES = {
  pushEnabled: true,
  dailyReminders: true,
  mentorshipActivity: true,
  callUpdates: true,
  systemNotifications: true,
};

export async function GET(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { adminDb } = getFirebaseAdmin();
    const doc = await adminDb.collection('notification_preferences').doc(authUser.uid).get();

    if (!doc.exists) {
      return NextResponse.json({ preferences: DEFAULT_PREFERENCES });
    }

    return NextResponse.json({
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...doc.data(),
      },
    });
  } catch (error) {
    console.error('[PreferencesAPI] Error getting preferences:', error);
    return NextResponse.json({ error: 'Failed to retrieve notification preferences.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { pushEnabled, dailyReminders, mentorshipActivity, callUpdates, systemNotifications } = body;

    const updates: Record<string, any> = {
      updatedAt: Timestamp.now(),
    };
    if (typeof pushEnabled === 'boolean') updates.pushEnabled = pushEnabled;
    if (typeof dailyReminders === 'boolean') updates.dailyReminders = dailyReminders;
    if (typeof mentorshipActivity === 'boolean') updates.mentorshipActivity = mentorshipActivity;
    if (typeof callUpdates === 'boolean') updates.callUpdates = callUpdates;
    if (typeof systemNotifications === 'boolean') updates.systemNotifications = systemNotifications;

    const { adminDb } = getFirebaseAdmin();
    const docRef = adminDb.collection('notification_preferences').doc(authUser.uid);
    await docRef.set(updates, { merge: true });

    const updatedDoc = await docRef.get();
    return NextResponse.json({
      message: 'Notification preferences updated.',
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...updatedDoc.data(),
      },
    });
  } catch (error) {
    console.error('[PreferencesAPI] Error updating preferences:', error);
    return NextResponse.json({ error: 'Failed to update notification preferences.' }, { status: 500 });
  }
}
