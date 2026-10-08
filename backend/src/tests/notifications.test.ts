import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { getVapidPublicKey, createNotification } from '../services/notificationService.js';
import { Notification } from '../models/Notification.js';

test('NOTIFICATIONS: VAPID public key is returned and valid', () => {
  const key = getVapidPublicKey();
  assert.ok(typeof key === 'string' && key.length > 20, 'Expected non-empty VAPID public key');
});

test('NOTIFICATIONS: createNotification persists in-app notification', async () => {
  const mockNotification = {
    _id: 'notif_123',
    userId: 'user_456',
    type: 'MENTEE_DAILY_SUBMITTED' as const,
    category: 'dailyReminders' as const,
    title: 'Daily response received',
    message: 'Rahul submitted today’s response.',
    link: '/mentor/mentees',
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMock = mock.method(Notification, 'create', async () => mockNotification as any);

  const result = await createNotification({
    userId: 'user_456',
    type: 'MENTEE_DAILY_SUBMITTED',
    category: 'dailyReminders',
    title: 'Daily response received',
    message: 'Rahul submitted today’s response.',
    link: '/mentor/mentees',
  });

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(result?.title, 'Daily response received');
  assert.equal(result?.read, false);
});
