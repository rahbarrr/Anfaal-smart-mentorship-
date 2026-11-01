import mongoose from 'mongoose';
import webpush from 'web-push';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { User } from '../models/User.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import type { NotificationCategory, NotificationType } from '../types/index.js';

// Stable fallback keys for deterministic development and test environments
const DEFAULT_VAPID_PUBLIC_KEY =
  'BPpSzImH31roiuz-FbCLjRr6u2q7xC95lU_lIefat1EPVN_dxRai190e9SEEOWeRYhfM41UQHKzYBFci0TVBKrM';
const DEFAULT_VAPID_PRIVATE_KEY = 'GHeCROArsmSRRr1-HUXC2t6LmYOBwcMaSKo6oCigSOE';
const DEFAULT_VAPID_SUBJECT = 'mailto:support@anfaal.org';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

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
      message: params.message,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: targetUrl,
      link: targetUrl,
      tag: params.idempotencyKey || params.type,
      notificationId: notification._id.toString(),
      type: params.type,
      timestamp: Date.now(),
      data: {
        url: targetUrl,
        link: targetUrl,
        notificationId: notification._id.toString(),
        type: params.type,
        title: params.title,
        message: params.message,
        body: params.message,
        timestamp: Date.now(),
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
    message?: string;
    icon?: string;
    badge?: string;
    url?: string;
    link?: string;
    tag: string;
    notificationId?: string;
    type?: string;
    timestamp?: number;
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
    console.info(`[NotificationService] Sending push (${category}) to ${subscriptions.length} device(s) for user ${userId}: "${payload.title}"`);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const res = await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payloadString,
            {
              TTL: 86400,
              urgency: 'high',
            },
          );
          console.info(`[NotificationService] Push delivered to ${sub.endpoint.slice(0, 35)}... (status: ${res.statusCode})`);
        } catch (err: any) {
          // Automatic cleanup of expired/unregistered subscriptions (HTTP 404 or 410)
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.warn(`[NotificationService] Pruning expired push subscription: ${sub.endpoint.slice(0, 35)}...`);
            await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
          } else {
            console.error(`[NotificationService] Push delivery warning for ${sub.endpoint.slice(0, 35)}...:`, err.statusCode, err.message);
          }
        }
      }),
    );
  } catch (err) {
    console.error('[NotificationService] Error in sendPushIfAllowed:', err);
  }
}

/**
 * Dispatches a direct Web Push notification to all active devices of a user.
 * Returns detailed delivery diagnostic results.
 */
export async function sendDirectPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  },
) {
  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (!subscriptions || subscriptions.length === 0) {
    return {
      attempted: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  const targetUrl = payload.url || '/mentee/daily';
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    message: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: targetUrl,
    link: targetUrl,
    tag: payload.tag || `direct-push-${Date.now()}`,
    type: 'DIRECT_PUSH',
    timestamp: Date.now(),
    data: {
      url: targetUrl,
      link: targetUrl,
      title: payload.title,
      body: payload.body,
      message: payload.body,
      timestamp: Date.now(),
    },
  });

  const results: Array<{ endpoint: string; status: number; success: boolean; error?: string }> = [];

  for (const sub of subscriptions) {
    try {
      const res = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        pushPayload,
        {
          TTL: 86400,
          urgency: 'high',
        },
      );
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: res.statusCode,
        success: true,
      });
      console.info(`[NotificationService] Direct push delivered to ${sub.endpoint.slice(0, 35)}... (status: ${res.statusCode})`);
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
      }
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: err.statusCode || 500,
        success: false,
        error: err.message || 'Push delivery failed',
      });
      console.error(`[NotificationService] Direct push failed for ${sub.endpoint.slice(0, 35)}...:`, err.statusCode, err.message);
    }
  }

  return {
    attempted: subscriptions.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
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
        title: 'AI Call Summary Ready',
        message: `The AI transcript and summary for ${menteeName}'s call are ready. Open Anfaal to view details.`,
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
        title: 'AI Call Summary Ready',
        message: 'Your AI-generated call summary is ready. Open Anfaal to view your summary.',
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

