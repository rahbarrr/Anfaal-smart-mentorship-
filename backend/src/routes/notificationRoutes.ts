import { Router, type Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { getVapidPublicKey, createNotification, sendDirectPushToUser, sendDirectPushToAll, resolveAllUserIds } from '../services/notificationService.js';

const router = Router();

// ─── VAPID Public Key ────────────────────────────────────────────────────────
router.get('/vapid-public-key', (_req, res: Response) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// ─── Get User Notifications ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const targetUserIds = await resolveAllUserIds(userId);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const unreadOnly = req.query.unread === 'true';

    const filter: Record<string, unknown> = { userId: { $in: targetUserIds } };
    if (unreadOnly) {
      filter.read = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: { $in: targetUserIds }, read: false }),
    ]);

    const formatted = notifications.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      category: n.category,
      title: n.title,
      message: n.message,
      link: n.link,
      read: n.read,
      metadata: n.metadata,
      createdAt: n.createdAt,
    }));

    res.json({
      notifications: formatted,
      unreadCount,
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] GET / error:', error);
    res.status(500).json({ message: 'Unable to retrieve notifications.' });
  }
});

// ─── Get Unread Count Only ───────────────────────────────────────────────────
router.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const targetUserIds = await resolveAllUserIds(userId);
    const unreadCount = await Notification.countDocuments({ userId: { $in: targetUserIds }, read: false });
    res.json({ unreadCount });
  } catch (error: any) {
    console.error('[NotificationRoutes] GET /unread-count error:', error);
    res.status(500).json({ message: 'Unable to retrieve unread notification count.' });
  }
});

// ─── Mark Single Notification As Read ─────────────────────────────────────────
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const targetUserIds = await resolveAllUserIds(userId);
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: { $in: targetUserIds } },
      { $set: { read: true } },
      { new: true },
    ).lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    const unreadCount = await Notification.countDocuments({ userId: { $in: targetUserIds }, read: false });

    res.json({
      message: 'Notification marked as read.',
      notification: {
        id: notification._id.toString(),
        read: true,
      },
      unreadCount,
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] PATCH /:id/read error:', error);
    res.status(500).json({ message: 'Unable to update notification.' });
  }
});

// ─── Mark All Notifications As Read ──────────────────────────────────────────
router.patch('/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const targetUserIds = await resolveAllUserIds(userId);
    await Notification.updateMany({ userId: { $in: targetUserIds }, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read.', unreadCount: 0 });
  } catch (error: any) {
    console.error('[NotificationRoutes] PATCH /read-all error:', error);
    res.status(500).json({ message: 'Unable to mark all notifications as read.' });
  }
});

// ─── Get Notification Preferences ────────────────────────────────────────────
router.get('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    let prefs = await NotificationPreference.findOne({ userId }).lean();

    if (!prefs) {
      prefs = await NotificationPreference.create({ userId });
    }

    res.json({
      preferences: {
        pushEnabled: prefs.pushEnabled,
        dailyReminders: prefs.dailyReminders,
        mentorshipActivity: prefs.mentorshipActivity,
        callUpdates: prefs.callUpdates,
        systemNotifications: prefs.systemNotifications,
      },
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] GET /preferences error:', error);
    res.status(500).json({ message: 'Unable to retrieve notification preferences.' });
  }
});

// ─── Update Notification Preferences ─────────────────────────────────────────
router.put('/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { pushEnabled, dailyReminders, mentorshipActivity, callUpdates, systemNotifications } = req.body;

    const updated = await NotificationPreference.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...(typeof pushEnabled === 'boolean' && { pushEnabled }),
          ...(typeof dailyReminders === 'boolean' && { dailyReminders }),
          ...(typeof mentorshipActivity === 'boolean' && { mentorshipActivity }),
          ...(typeof callUpdates === 'boolean' && { callUpdates }),
          ...(typeof systemNotifications === 'boolean' && { systemNotifications }),
        },
      },
      { upsert: true, new: true },
    ).lean();

    res.json({
      message: 'Notification preferences updated.',
      preferences: {
        pushEnabled: updated.pushEnabled,
        dailyReminders: updated.dailyReminders,
        mentorshipActivity: updated.mentorshipActivity,
        callUpdates: updated.callUpdates,
        systemNotifications: updated.systemNotifications,
      },
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] PUT /preferences error:', error);
    res.status(500).json({ message: 'Unable to update notification preferences.' });
  }
});

// ─── Register Web Push Subscription ──────────────────────────────────────────
router.post('/push-subscription', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ message: 'Invalid push subscription payload.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
          userAgent: userAgent || req.headers['user-agent'] || '',
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    res.status(201).json({ message: 'Push subscription registered successfully.' });
  } catch (error: any) {
    console.error('[NotificationRoutes] POST /push-subscription error:', error);
    res.status(500).json({ message: 'Unable to register push subscription.' });
  }
});

// ─── Unregister Web Push Subscription ────────────────────────────────────────
router.delete('/push-subscription', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { endpoint } = req.body;

    if (endpoint) {
      await PushSubscription.deleteOne({ userId, endpoint });
    } else {
      // If no specific endpoint is provided, remove all subscriptions for this user
      await PushSubscription.deleteMany({ userId });
    }

    res.json({ message: 'Push subscription removed successfully.' });
  } catch (error: any) {
    console.error('[NotificationRoutes] DELETE /push-subscription error:', error);
    res.status(500).json({ message: 'Unable to remove push subscription.' });
  }
});

// ─── Test Push Notification Endpoint ────────────────────────────────────────
router.post('/test-push', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callerId = req.user!.id;
    const isCallerAdmin = req.user!.role === 'ADMIN';

    const broadcast = req.body.broadcast === true || req.body.target === 'all';
    const targetUserId = (isCallerAdmin && req.body.userId) ? req.body.userId : callerId;
    const title = req.body.title || 'Anfaal Test Notification';
    const message =
      req.body.message ||
      'Background push notifications are working correctly!';
    const link = req.body.link || '/';

    console.info(`[NotificationRoutes] POST /test-push initiated by ${req.user!.email} (${req.user!.role}). Broadcast: ${broadcast}`);

    let directResult;
    if (broadcast && isCallerAdmin) {
      directResult = await sendDirectPushToAll({
        title,
        body: message,
        url: link,
        tag: `test-push-broadcast-${Date.now()}`,
      });
    } else {
      // 1. Create in-app notification so user sees it in their notification list
      void createNotification({
        userId: targetUserId,
        type: 'DAILY_REMINDER',
        category: 'dailyReminders',
        title,
        message,
        link,
        idempotencyKey: `test-push:${targetUserId}:${Date.now()}`,
      }).catch((err) => console.error('[NotificationRoutes] in-app notification create error:', err));

      // 2. Send direct push notification with high urgency and 24h TTL
      directResult = await sendDirectPushToUser(targetUserId, {
        title,
        body: message,
        url: link,
        tag: `test-push-${Date.now()}`,
      });
    }

    res.json({
      success: directResult.successful > 0,
      message:
        directResult.attempted === 0
          ? 'No active device subscriptions found. Please open Anfaal on your device, ensure notifications are allowed, and verify the service worker is active.'
          : `Push notification dispatched to ${directResult.successful} of ${directResult.attempted} device(s).`,
      targetUserId: broadcast ? 'all' : targetUserId,
      summary: directResult,
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] POST /test-push error:', error);
    res.status(500).json({ message: 'Unable to send test push notification.', error: error.message });
  }
});

// ─── Get Push Notification Diagnostic Status ────────────────────────────────
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const isCallerAdmin = req.user!.role === 'ADMIN';

    const [userSubscriptions, allSubscriptionsCount, prefs] = await Promise.all([
      PushSubscription.find({ userId }).select('endpoint userAgent createdAt').lean(),
      isCallerAdmin ? PushSubscription.countDocuments() : Promise.resolve(0),
      NotificationPreference.findOne({ userId }).lean(),
    ]);

    res.json({
      vapidConfigured: Boolean(getVapidPublicKey()),
      pushEnabled: prefs ? prefs.pushEnabled : true,
      registeredDevices: userSubscriptions.length,
      totalSystemDevices: allSubscriptionsCount,
      devices: userSubscriptions.map((s) => ({
        endpointSnippet: s.endpoint.slice(0, 45) + '...',
        userAgent: s.userAgent || 'Unknown',
        createdAt: s.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('[NotificationRoutes] GET /status error:', error);
    res.status(500).json({ message: 'Unable to retrieve notification status.' });
  }
});

export default router;
