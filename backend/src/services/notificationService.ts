import mongoose from 'mongoose';
import webpush from 'web-push';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { User } from '../models/User.js';
import { Mentee } from '../models/Mentee.js';
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
 * Resolves all distinct MongoDB User, Mentee, and Mentor IDs associated with an identifier.
 * Ensures PushSubscription lookups always find the user's active device subscriptions,
 * regardless of whether a notification was created using User._id, Mentee._id, or Mentor._id.
 */
export async function resolveAllUserIds(userId: string): Promise<string[]> {
  const idSet = new Set<string>();
  if (!userId) return [];
  const strId = String(userId).trim();
  idSet.add(strId);

  try {
    if (mongoose.connection.readyState === 1) {
      // 1. If strId matches a User document
      if (mongoose.isValidObjectId(strId)) {
        const user = await User.findById(strId).lean().catch(() => null);
        if (user) {
          idSet.add(String(user._id));
          if ((user as any).menteeId) idSet.add(String((user as any).menteeId));
          if ((user as any).mentorId) idSet.add(String((user as any).mentorId));
        }
      }

      // 2. If strId is linked to a Mentee document
      const mentee = await Mentee.findOne({
        $or: [
          ...(mongoose.isValidObjectId(strId) ? [{ _id: strId }] : []),
          { userId: strId },
        ],
      }).lean().catch(() => null);
      if (mentee) {
        idSet.add(String(mentee._id));
        if (mentee.userId) idSet.add(String(mentee.userId));
      }

      // 3. If strId is linked to a Mentor document
      const mentor = await Mentor.findOne({
        $or: [
          ...(mongoose.isValidObjectId(strId) ? [{ _id: strId }] : []),
          { userId: strId },
        ],
      }).lean().catch(() => null);
      if (mentor) {
        idSet.add(String(mentor._id));
        if (mentor.userId) idSet.add(String(mentor.userId));
      }
    }
  } catch (err) {
    // Non-blocking fallback to input id
  }

  return Array.from(idSet);
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
 * Resolves user aliases so subscriptions stored under User._id, Mentee._id, or Mentor._id match reliably.
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

    const targetUserIds = await resolveAllUserIds(userId);

    const prefs = await NotificationPreference.findOne({ userId: { $in: targetUserIds } }).lean();
    if (prefs) {
      if (!prefs.pushEnabled) {
        console.info(`[NotificationService] Push disabled in preferences for ${userId}`);
        return;
      }
      if (category === 'dailyReminders' && !prefs.dailyReminders) return;
      if (category === 'mentorshipActivity' && !prefs.mentorshipActivity) return;
      if (category === 'callUpdates' && !prefs.callUpdates) return;
      if (category === 'systemNotifications' && !prefs.systemNotifications) return;
    }

    const subscriptions = await PushSubscription.find({ userId: { $in: targetUserIds } }).lean();
    if (!subscriptions || subscriptions.length === 0) {
      console.info(`[NotificationService] No push subscriptions found for user ${userId} (checked: ${targetUserIds.join(', ')})`);
      return;
    }

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
  const targetUserIds = await resolveAllUserIds(userId);
  const subscriptions = await PushSubscription.find({ userId: { $in: targetUserIds } }).lean();
  console.info(`[NotificationService] [Step 1] Subscriptions found for user ${userId} (matched IDs: ${targetUserIds.join(', ')}): ${subscriptions?.length || 0}`);

  if (!subscriptions || subscriptions.length === 0) {
    return {
      attempted: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  const targetUrl = payload.url || '/';
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
    // Step 2: Push request sent to push service
    console.info(`[NotificationService] [Step 2] Sending push request to push service: ${sub.endpoint.slice(0, 45)}... with title: "${payload.title}"`);
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
      // Step 3: Push service response received
      console.info(`[NotificationService] [Step 3] Push service response received: status code ${res.statusCode} for ${sub.endpoint.slice(0, 45)}...`);
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: res.statusCode,
        success: true,
      });
    } catch (err: any) {
      console.error(`[NotificationService] [Step 3 Failed] Push service error for ${sub.endpoint.slice(0, 45)}...:`, err.statusCode, err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.warn(`[NotificationService] Pruning expired/invalid subscription: ${sub.endpoint.slice(0, 45)}...`);
        await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
      }
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: err.statusCode || 500,
        success: false,
        error: err.message || 'Push delivery failed',
      });
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
 * Dispatches a direct Web Push notification to all active devices in the database.
 * Used for admin testing and diagnostic verification.
 */
export async function sendDirectPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  // Step 1: Subscriptions found across all users
  const subscriptions = await PushSubscription.find({}).lean();
  console.info(`[NotificationService] [Step 1] Total subscriptions found in system: ${subscriptions?.length || 0}`);

  if (!subscriptions || subscriptions.length === 0) {
    return {
      attempted: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  const targetUrl = payload.url || '/';
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    message: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: targetUrl,
    link: targetUrl,
    tag: payload.tag || `broadcast-push-${Date.now()}`,
    type: 'BROADCAST_PUSH',
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
    // Step 2: Push request sent to push service
    console.info(`[NotificationService] [Step 2] Sending push request to push service: ${sub.endpoint.slice(0, 45)}... (User: ${sub.userId})`);
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
      // Step 3: Push service response received
      console.info(`[NotificationService] [Step 3] Push service response received: status code ${res.statusCode} for ${sub.endpoint.slice(0, 45)}...`);
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: res.statusCode,
        success: true,
      });
    } catch (err: any) {
      console.error(`[NotificationService] [Step 3 Failed] Push service error for ${sub.endpoint.slice(0, 45)}...:`, err.statusCode, err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
      }
      results.push({
        endpoint: sub.endpoint.slice(0, 45) + '...',
        status: err.statusCode || 500,
        success: false,
        error: err.message || 'Push delivery failed',
      });
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
 * Notifies all administrator accounts with in-app notification and Web Push.
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
 * Handles mentor resolution for both Mentor._id and User._id keys.
 */
export async function notifyMentorsForMentee(
  menteeId: string,
  params: Omit<CreateNotificationParams, 'userId'>,
) {
  try {
    const mentorships = await Mentorship.find({ menteeId, status: 'active' }).lean();
    if (!mentorships || mentorships.length === 0) return;

    for (const ms of mentorships) {
      let mentorUserId = ms.mentorId;
      const mentor =
        (await Mentor.findById(ms.mentorId).lean()) ||
        (await Mentor.findOne({ userId: ms.mentorId }).lean());
      if (mentor?.userId) {
        mentorUserId = mentor.userId;
      }

      const idempotencyKey = params.idempotencyKey
        ? `${params.idempotencyKey}:mentor:${mentorUserId}`
        : undefined;

      await createNotification({
        ...params,
        userId: mentorUserId,
        idempotencyKey,
      });
    }
  } catch (err) {
    console.error('[NotificationService] Error notifying mentor for mentee:', err);
  }
}

/**
 * Dispatches an in-app and push notification to the recipient of a chat message.
 */
export async function notifyChatRecipient(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  messageText: string;
  messageId: string;
}) {
  try {
    const sender = await User.findById(params.senderId).select('name role').lean();
    const senderName = sender?.name || 'Someone';
    const preview = params.messageText.length > 100
      ? `${params.messageText.slice(0, 97)}...`
      : params.messageText;

    await createNotification({
      userId: params.recipientId,
      type: 'MENTOR_FEEDBACK_RECEIVED',
      category: 'mentorshipActivity',
      title: `New message from ${senderName}`,
      message: preview,
      link: `/chat?c=${params.conversationId}`,
      metadata: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        messageId: params.messageId,
      },
      idempotencyKey: `chat-msg:${params.messageId}:${params.recipientId}`,
    });
  } catch (err) {
    console.error('[NotificationService] Error notifying chat recipient:', err);
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
    const menteeUserId = mentee?.userId || (await resolveAllUserIds(call.menteeId))[0];
    if (menteeUserId) {
      await createNotification({
        userId: menteeUserId,
        type: 'CALL_SUMMARY_AVAILABLE',
        category: 'callUpdates',
        title: 'AI Call Summary Ready',
        message: 'Your AI-generated call summary is ready. Open Anfaal to view your summary.',
        link: '/mentee/history',
        metadata: { callId, mentorId: call.mentorId },
        idempotencyKey: `call-completed:${callId}:mentee:${menteeUserId}`,
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


