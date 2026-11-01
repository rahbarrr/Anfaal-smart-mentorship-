import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { getVapidPublicKey, createNotification, notifyCallCompletion } from '../services/notificationService.js';
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
    title: 'Daily Log Submitted',
    message: 'Rahul Sharma submitted today’s daily performance.',
    link: '/mentor/mentees/mentee_1',
    read: false,
    idempotencyKey: 'daily-submitted:rec_1:mentor:user_456',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mock.method(Notification, 'findOne', () => ({
    lean: async () => null,
  }) as any);
  const createMock = mock.method(Notification, 'create', async () => mockNotification as any);

  const result = await createNotification({
    userId: 'user_456',
    type: 'MENTEE_DAILY_SUBMITTED',
    category: 'dailyReminders',
    title: 'Daily Log Submitted',
    message: 'Rahul Sharma submitted today’s daily performance.',
    link: '/mentor/mentees/mentee_1',
    idempotencyKey: 'daily-submitted:rec_1:mentor:user_456',
  });

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(result?.title, 'Daily Log Submitted');
  assert.equal(result?.read, false);
});

test('NOTIFICATIONS: duplicate notification is suppressed via idempotencyKey', async () => {
  const existingNotification = {
    _id: 'notif_existing',
    userId: 'user_456',
    type: 'CALL_PROCESSING_COMPLETED' as const,
    category: 'callUpdates' as const,
    title: 'Call Summary Ready',
    message: 'The AI transcript and summary for Rahul Sharma’s call are ready.',
    link: '/mentor/calls/call_99',
    read: false,
    idempotencyKey: 'call-completed:call_99:mentor:user_456',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mock finding existing notification
  mock.method(Notification, 'findOne', () => ({
    lean: async () => existingNotification,
  }) as any);
  const createMock = mock.method(Notification, 'create', async () => {
    throw new Error('Should not call create when existing notification found');
  });

  const result = await createNotification({
    userId: 'user_456',
    type: 'CALL_PROCESSING_COMPLETED',
    category: 'callUpdates',
    title: 'Call Summary Ready',
    message: 'The AI transcript and summary for Rahul Sharma’s call are ready.',
    link: '/mentor/calls/call_99',
    idempotencyKey: 'call-completed:call_99:mentor:user_456',
  });

  assert.equal(createMock.mock.callCount(), 0, 'create should NOT be called for duplicate event');
  assert.equal(result?._id, 'notif_existing');
  assert.equal(result?.title, 'Call Summary Ready');
});

test('NOTIFICATIONS: mentor feedback notification is created with correct content', async () => {
  const mockNotification = {
    _id: 'notif_feedback_1',
    userId: 'mentee_user_1',
    type: 'MENTOR_FEEDBACK_RECEIVED' as const,
    category: 'mentorshipActivity' as const,
    title: 'New Mentor Feedback',
    message: 'Your mentor has shared feedback on your recent progress. Check it out!',
    link: '/mentee/profile',
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mock.method(Notification, 'findOne', () => ({
    lean: async () => null,
  }) as any);
  const createMock = mock.method(Notification, 'create', async () => mockNotification as any);

  const result = await createNotification({
    userId: 'mentee_user_1',
    type: 'MENTOR_FEEDBACK_RECEIVED',
    category: 'mentorshipActivity',
    title: 'New Mentor Feedback',
    message: 'Your mentor has shared feedback on your recent progress. Check it out!',
    link: '/mentee/profile',
  });

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(result?.type, 'MENTOR_FEEDBACK_RECEIVED');
  assert.equal(result?.title, 'New Mentor Feedback');
  assert.equal(result?.message, 'Your mentor has shared feedback on your recent progress. Check it out!');
  assert.equal(result?.link, '/mentee/profile');
});

test('NOTIFICATIONS: new assignment notification is created with correct content', async () => {
  const mockNotification = {
    _id: 'notif_assignment_1',
    userId: 'mentee_user_2',
    type: 'NEW_TASK_ASSIGNED' as const,
    category: 'mentorshipActivity' as const,
    title: 'New Assignment Received',
    message: 'Your mentor has assigned you a new task. Open Anfaal for details.',
    link: '/mentee/profile',
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mock.method(Notification, 'findOne', () => ({
    lean: async () => null,
  }) as any);
  const createMock = mock.method(Notification, 'create', async () => mockNotification as any);

  const result = await createNotification({
    userId: 'mentee_user_2',
    type: 'NEW_TASK_ASSIGNED',
    category: 'mentorshipActivity',
    title: 'New Assignment Received',
    message: 'Your mentor has assigned you a new task. Open Anfaal for details.',
    link: '/mentee/profile',
  });

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(result?.type, 'NEW_TASK_ASSIGNED');
  assert.equal(result?.title, 'New Assignment Received');
  assert.equal(result?.message, 'Your mentor has assigned you a new task. Open Anfaal for details.');
  assert.equal(result?.link, '/mentee/profile');
});
