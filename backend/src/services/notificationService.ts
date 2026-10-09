import mongoose from 'mongoose';
import webpush from 'web-push';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { User } from '../models/User.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import type { NotificationCategory, NotificationType } from '../types/index.js';

// VAPID keys setup: Use environment variables or persistent fallback for development
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@anfaal.org';

if (!vapidPublicKey || !vapidPrivateKey) {
  // Deterministic or runtime keys if not set in environment
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
}

try {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} catch (err) {
  console.warn('[NotificationService] VAPID initialization warning:', err);
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Creates an in-app notification record and dispatches Web Push if enabled.
 * Uses idempotencyKey to prevent duplicate in-app records and duplicate push notifications.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    if (params.idempotencyKey) {
      const existing = await Notification.findOne({ idempotencyKey: params.idempotencyKey }).lean();
      if (existing) {
        console.info(`[NotificationService] Duplicate notification suppressed for idempotencyKey: ${params.idempotencyKey}`);
        return existing;
      }
    }

    let notification;
    try {
      notification = await Notification.create({
        userId: params.userId,
        type: params.type,
        category: params.category,
        title: params.title,
        message: params.message,
        link: params.link,
        metadata: params.metadata,
        idempotencyKey: params.idempotencyKey,
        read: false,
      });
    } catch (createErr: any) {
      // Catch concurrent creation race condition
      if (createErr?.code === 11000 && params.idempotencyKey) {
        console.info(`[NotificationService] Concurrent duplicate notification prevented for idempotencyKey: ${params.idempotencyKey}`);
        return await Notification.findOne({ idempotencyKey: params.idempotencyKey }).lean();
      }
      throw createErr;
    }

    // Check user preference before sending push
    const targetUrl = params.link || '/';
    void sendPushIfAllowed(params.userId, params.category, {
      title: params.title,
      body: params.message,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: targetUrl,
      link: targetUrl,
      tag: params.idempotencyKey || params.type,
      notificationId: notification._id.toString(),
      type: params.type,
      data: {
        url: targetUrl,
        link: targetUrl,
        notificationId: notification._id.toString(),
        type: params.type,
      },
    });

    return notification;
  } catch (error) {
    console.error('[NotificationService] Error creating notification:', error);
    return null;
  }
}

/**
 * Sends a push notification to all active devices of a user if user preferences permit it.
 */
async function sendPushIfAllowed(
  userId: string,
  category: NotificationCategory,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    link?: string;
    tag: string;
    notificationId?: string;
    type?: string;
    data?: Record<string, unknown>;
  },
) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const prefs = await NotificationPreference.findOne({ userId }).lean();
    if (prefs) {
      if (!prefs.pushEnabled) return;
      if (category === 'dailyReminders' && !prefs.dailyReminders) return;
      if (category === 'mentorshipActivity' && !prefs.mentorshipActivity) return;
      if (category === 'callUpdates' && !prefs.callUpdates) return;
      if (category === 'systemNotifications' && !prefs.systemNotifications) return;
    }

    const subscriptions = await PushSubscription.find({ userId }).lean();
    if (!subscriptions || subscriptions.length === 0) return;

    const payloadString = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payloadString,
          );
        } catch (err: any) {
          // Automatic cleanup of expired/unregistered subscriptions (HTTP 404 or 410)
          if (err.statusCode === 404 || err.statusCode === 410) {
            await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
          } else {
            console.warn(`[NotificationService] Push delivery warning for endpoint: ${sub.endpoint.slice(0, 30)}...`, err.message);
          }
        }
      }),
    );
  } catch (err) {
    console.error('[NotificationService] Error in sendPushIfAllowed:', err);
  }
}

/**
 * Notifies all administrator accounts.
 */
export async function notifyAdmins(params: Omit<CreateNotificationParams, 'userId'>) {
  try {
    const admins = await User.find({ role: 'ADMIN', status: 'active' }).select('_id').lean();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          ...params,
          userId: admin._id.toString(),
          idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:admin:${admin._id}` : undefined,
        }),
      ),
    );
  } catch (err) {
    console.error('[NotificationService] Error notifying admins:', err);
  }
}

/**
 * Notifies all active mentors assigned to a given mentee.
 */
export async function notifyMentorsForMentee(
  menteeId: string,
  params: Omit<CreateNotificationParams, 'userId'>,
) {
  try {
    const mentorships = await Mentorship.find({ menteeId, status: 'active' }).lean();
    if (!mentorships || mentorships.length === 0) return;

    for (const ms of mentorships) {
      // Find mentor record to get their userId
      const mentor = await Mentor.findById(ms.mentorId).lean();
      if (mentor?.userId) {
        const idempotencyKey = params.idempotencyKey
          ? `${params.idempotencyKey}:mentor:${mentor.userId}`
          : undefined;
        await createNotification({
          ...params,
          userId: mentor.userId,
          idempotencyKey,
        });
      }
    }
  } catch (err) {
    console.error('[NotificationService] Error notifying mentor for mentee:', err);
  }
}

/**
 * Notifies mentor and mentee when call processing finishes successfully.
 * Enforces idempotency per call and recipient to prevent duplicate notifications on job retries.
 */
export async function notifyCallCompletion(callId: string) {
  try {
    const { Call } = await import('../models/Call.js');
    const call = await Call.findById(callId).lean();
    if (!call) return;

    const mentee = await (await import('../models/Mentee.js')).Mentee.findById(call.menteeId).select('name userId').lean();
    const mentor = await Mentor.findById(call.mentorId).select('userId').lean();
    const menteeName = mentee?.name || 'Student';

    // 1. Notify mentor
    if (mentor?.userId) {
      await createNotification({
        userId: mentor.userId,
        type: 'CALL_PROCESSING_COMPLETED',
        category: 'callUpdates',
        title: 'Call Summary Ready',
        message: `The AI transcript and summary for ${menteeName}'s call are ready.`,
        link: `/mentor/calls/${callId}`,
        metadata: { callId, menteeId: call.menteeId },
        idempotencyKey: `call-completed:${callId}:mentor:${mentor.userId}`,
      });
    }

    // 2. Notify mentee
    if (mentee?.userId) {
      await createNotification({
        userId: mentee.userId,
        type: 'CALL_SUMMARY_AVAILABLE',
        category: 'callUpdates',
        title: 'Your Call Summary Is Ready',
        message: "Your mentor's call summary is now available.",
        link: '/mentee/history',
        metadata: { callId, mentorId: call.mentorId },
        idempotencyKey: `call-completed:${callId}:mentee:${mentee.userId}`,
      });
    }
  } catch (err) {
    console.error('[NotificationService] Error notifying call completion:', err);
  }
}

/**
 * Notifies mentor and admins when call processing fails permanently.
 */
export async function notifyCallFailure(callId: string, errorReason?: string) {
  try {
    const { Call } = await import('../models/Call.js');
    const call = await Call.findById(callId).lean();
    if (call) {
      const mentor = await Mentor.findById(call.mentorId).select('userId').lean();
      if (mentor?.userId) {
        await createNotification({
          userId: mentor.userId,
          type: 'CALL_PROCESSING_FAILED',
          category: 'callUpdates',
          title: 'Call processing failed',
          message: errorReason || 'Audio processing could not be completed. You can retry processing.',
          link: `/mentor/calls/${callId}`,
          metadata: { callId },
        });
      }
    }

    // Also notify admins
    await notifyAdmins({
      type: 'CALL_PROCESSING_FAILED',
      category: 'systemNotifications',
      title: 'Call processing failed',
      message: `Call processing failed for call ${callId}.`,
      link: '/admin/calls',
      metadata: { callId, error: errorReason },
    });
  } catch (err) {
    console.error('[NotificationService] Error notifying call failure:', err);
  }
}

