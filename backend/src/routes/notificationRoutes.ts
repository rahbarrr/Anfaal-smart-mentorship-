import { Router, type Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { getVapidPublicKey } from '../services/notificationService.js';

const router = Router();

// ─── VAPID Public Key ────────────────────────────────────────────────────────
router.get('/vapid-public-key', (_req, res: Response) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// ─── Get User Notifications ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const unreadOnly = req.query.unread === 'true';

    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) {
      filter.read = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId, read: false }),
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
    const unreadCount = await Notification.countDocuments({ userId, read: false });
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
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { $set: { read: true } },
      { new: true },
    ).lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    const unreadCount = await Notification.countDocuments({ userId, read: false });

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
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
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

export default router;
