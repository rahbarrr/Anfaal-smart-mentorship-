import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const DEFAULT_SLOTS = [
  { slotIndex: 1, time: '17:00', enabled: true },
  { slotIndex: 2, time: '19:00', enabled: true },
  { slotIndex: 3, time: '21:00', enabled: true },
];

export async function GET(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser || (authUser.role !== 'MENTOR' && authUser.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { adminDb } = getFirebaseAdmin();
    const doc = await adminDb.collection('mentor_reminder_settings').doc(authUser.uid).get();

    if (!doc.exists) {
      return NextResponse.json({
        settings: {
          mentorId: authUser.uid,
          enabled: true,
          timezone: 'Asia/Kolkata',
          slots: DEFAULT_SLOTS,
        },
      });
    }

    const data = doc.data()!;
    return NextResponse.json({
      settings: {
        mentorId: authUser.uid,
        enabled: data.enabled ?? true,
        timezone: data.timezone || 'Asia/Kolkata',
        slots: Array.isArray(data.slots) && data.slots.length > 0 ? data.slots : DEFAULT_SLOTS,
      },
    });
  } catch (error) {
    console.error('[ReminderSettingsAPI] Error getting reminder settings:', error);
    return NextResponse.json({ error: 'Failed to retrieve reminder settings.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser || (authUser.role !== 'MENTOR' && authUser.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { enabled, timezone, slots } = body;

    const cleanSettings = {
      mentorId: authUser.uid,
      enabled: typeof enabled === 'boolean' ? enabled : true,
      timezone: timezone || 'Asia/Kolkata',
      slots: Array.isArray(slots) ? slots : DEFAULT_SLOTS,
      updatedAt: Timestamp.now(),
    };

    const { adminDb } = getFirebaseAdmin();
    await adminDb.collection('mentor_reminder_settings').doc(authUser.uid).set(cleanSettings, { merge: true });

    return NextResponse.json({
      message: 'Reminder settings updated successfully.',
      settings: cleanSettings,
    });
  } catch (error) {
    console.error('[ReminderSettingsAPI] Error updating reminder settings:', error);
    return NextResponse.json({ error: 'Failed to update reminder settings.' }, { status: 500 });
  }
}
