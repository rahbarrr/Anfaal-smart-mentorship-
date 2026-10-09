import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  validateReminderSettings,
  getLocalTimeInTimezone,
  isSlotWindowActive,
  getReminderContentForSlot,
  timeToMinutes,
  DEFAULT_REMINDER_TIMEZONE,
  evaluateDailyProgressReminders,
} from '../services/reminderSchedulerService.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentee } from '../models/Mentee.js';
import { User } from '../models/User.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { DailyReminderSetting } from '../models/DailyReminderSetting.js';
import { Notification } from '../models/Notification.js';

test('REMINDER SETTINGS VALIDATION: valid default schedule', () => {
  const result = validateReminderSettings({
    enabled: true,
    timezone: 'Asia/Kolkata',
    slots: [
      { slotIndex: 1, time: '17:00', enabled: true },
      { slotIndex: 2, time: '19:00', enabled: true },
      { slotIndex: 3, time: '21:00', enabled: true },
    ],
  });
  assert.equal(result.valid, true);
  assert.equal(result.normalized?.slots.length, 3);
  assert.equal(result.normalized?.slots[0].time, '17:00');
});

test('REMINDER SETTINGS VALIDATION: rejects non-chronological order', () => {
  const result = validateReminderSettings({
    enabled: true,
    timezone: 'Asia/Kolkata',
    slots: [
      { slotIndex: 1, time: '19:00', enabled: true },
      { slotIndex: 2, time: '17:00', enabled: true },
      { slotIndex: 3, time: '21:00', enabled: true },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /cannot be earlier than or equal to/i);
});

test('REMINDER SETTINGS VALIDATION: rejects duplicate times', () => {
  const result = validateReminderSettings({
    enabled: true,
    timezone: 'Asia/Kolkata',
    slots: [
      { slotIndex: 1, time: '17:00', enabled: true },
      { slotIndex: 2, time: '17:00', enabled: true },
      { slotIndex: 3, time: '21:00', enabled: true },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /duplicate time/i);
});

test('REMINDER SETTINGS VALIDATION: rejects invalid timezone', () => {
  const result = validateReminderSettings({
    enabled: true,
    timezone: 'Invalid/NonExistent_Zone',
    slots: [
      { slotIndex: 1, time: '17:00', enabled: true },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /Invalid timezone identifier/i);
});

test('REMINDER TIMEZONE & WINDOWS: time math and slot window detection', () => {
  assert.equal(timeToMinutes('17:00'), 17 * 60);
  assert.equal(timeToMinutes('19:30'), 19 * 60 + 30);

  // Slot '17:00' -> 1020 minutes
  assert.equal(isSlotWindowActive('17:00', 1020), true, 'Exact match at 17:00');
  assert.equal(isSlotWindowActive('17:00', 1025), true, '5 mins into 17:00 window');
  assert.equal(isSlotWindowActive('17:00', 1034), true, '14 mins into 17:00 window');
  assert.equal(isSlotWindowActive('17:00', 1035), false, 'Window expired after 15 mins');
  assert.equal(isSlotWindowActive('17:00', 1019), false, 'Before 17:00');
});

test('REMINDER CONTENT: friendly progression across slots', () => {
  const slot1 = getReminderContentForSlot(1);
  assert.equal(slot1.title, 'Daily Progress Reminder');
  assert.equal(slot1.body, "Don't forget to complete your daily progress today.");

  const slot2 = getReminderContentForSlot(2);
  assert.equal(slot2.title, 'Daily Progress Still Pending');
  assert.equal(slot2.body, "You haven't submitted today's daily progress yet.");

  const slot3 = getReminderContentForSlot(3);
  assert.equal(slot3.title, 'Final Daily Progress Reminder');
  assert.equal(slot3.body, 'Your daily progress for today is still pending.');
});

test('EVALUATION (CASE 1): mentee has NOT submitted -> reminder notification is dispatched', async () => {
  mock.method(Mentorship, 'find', () => ({
    lean: async () => [{ mentorId: 'mentor_1', menteeId: 'mentee_1', status: 'active' }],
  }) as any);

  mock.method(DailyReminderSetting, 'findOne', () => ({
    lean: async () => ({
      mentorId: 'mentor_1',
      enabled: true,
      timezone: 'Asia/Kolkata',
      slots: [
        { slotIndex: 1, time: '17:00', enabled: true },
        { slotIndex: 2, time: '19:00', enabled: true },
        { slotIndex: 3, time: '21:00', enabled: true },
      ],
    }),
  }) as any);

  mock.method(Mentee, 'findById', () => ({
    lean: async () => ({
      _id: 'mentee_1',
      name: 'Rahul Sharma',
      status: 'active',
      userId: 'user_mentee_1',
    }),
  }) as any);

  mock.method(User, 'findById', () => ({
    lean: async () => ({
      _id: 'user_mentee_1',
      name: 'Rahul Sharma',
      status: 'active',
    }),
  }) as any);

  // Mentee has NOT submitted today
  mock.method(DailyPerformance, 'findOne', () => ({
    lean: async () => null,
  }) as any);

  // No duplicate notification yet
  mock.method(Notification, 'findOne', () => ({
    lean: async () => null,
  }) as any);

  const notifCreateMock = mock.method(Notification, 'create', async (data: any) => ({
    _id: 'notif_new',
    ...data,
  }));

  // Target date at 17:05 Asia/Kolkata (UTC is 11:35)
  // 2026-10-09 11:35:00 UTC = 2026-10-09 17:05:00 IST
  const targetDate = new Date('2026-10-09T11:35:00.000Z');

  const result = await evaluateDailyProgressReminders(targetDate);

  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.sentCount, 1);
  assert.equal(result.skippedSubmitted, 0);
  assert.equal(notifCreateMock.mock.callCount(), 1);

  const callArgs = notifCreateMock.mock.calls[0].arguments[0] as any;
  assert.equal(callArgs.title, 'Daily Progress Reminder');
  assert.equal(callArgs.link, '/mentee/daily');
  assert.equal(callArgs.idempotencyKey, 'daily-reminder:mentee_1:2026-10-09:slot1');
});

test('EVALUATION (CASE 2 & 3): mentee ALREADY submitted today -> NO reminder sent', async () => {
  mock.method(Mentorship, 'find', () => ({
    lean: async () => [{ mentorId: 'mentor_1', menteeId: 'mentee_1', status: 'active' }],
  }) as any);

  mock.method(DailyReminderSetting, 'findOne', () => ({
    lean: async () => ({
      mentorId: 'mentor_1',
      enabled: true,
      timezone: 'Asia/Kolkata',
      slots: [
        { slotIndex: 1, time: '17:00', enabled: true },
        { slotIndex: 2, time: '19:00', enabled: true },
        { slotIndex: 3, time: '21:00', enabled: true },
      ],
    }),
  }) as any);

  mock.method(Mentee, 'findById', () => ({
    lean: async () => ({
      _id: 'mentee_1',
      name: 'Rahul Sharma',
      status: 'active',
      userId: 'user_mentee_1',
    }),
  }) as any);

  mock.method(User, 'findById', () => ({
    lean: async () => ({
      _id: 'user_mentee_1',
      name: 'Rahul Sharma',
      status: 'active',
    }),
  }) as any);

  // Mentee HAS submitted today!
  mock.method(DailyPerformance, 'findOne', () => ({
    lean: async () => ({
      _id: 'perf_today',
      menteeId: 'mentee_1',
      date: '2026-10-09',
      studyMinutes: 60,
    }),
  }) as any);

  const notifCreateMock = mock.method(Notification, 'create', async () => {
    throw new Error('Should not create notification when daily performance already submitted');
  });

  // Time at 19:05 IST (slot 2)
  const targetDate = new Date('2026-10-09T13:35:00.000Z');

  const result = await evaluateDailyProgressReminders(targetDate);

  assert.equal(result.evaluatedCount, 1);
  assert.equal(result.sentCount, 0);
  assert.equal(result.skippedSubmitted, 1, 'Submission must be detected and reminder skipped');
  assert.equal(notifCreateMock.mock.callCount(), 0);
});

test('EVALUATION (CASE 5): mentor disabled reminders -> NO reminders sent', async () => {
  mock.method(Mentorship, 'find', () => ({
    lean: async () => [{ mentorId: 'mentor_1', menteeId: 'mentee_1', status: 'active' }],
  }) as any);

  mock.method(DailyReminderSetting, 'findOne', () => ({
    lean: async () => ({
      mentorId: 'mentor_1',
      enabled: false, // Disabled by mentor!
      timezone: 'Asia/Kolkata',
      slots: [
        { slotIndex: 1, time: '17:00', enabled: true },
      ],
    }),
  }) as any);

  const notifCreateMock = mock.method(Notification, 'create', async () => {
    throw new Error('Should not create notification when mentor disabled reminders');
  });

  const targetDate = new Date('2026-10-09T11:35:00.000Z');
  const result = await evaluateDailyProgressReminders(targetDate);

  assert.equal(result.sentCount, 0);
  assert.equal(notifCreateMock.mock.callCount(), 0);
});

test('EVALUATION (CASE 7): idempotency suppresses duplicate notification on worker retry', async () => {
  mock.method(Mentorship, 'find', () => ({
    lean: async () => [{ mentorId: 'mentor_1', menteeId: 'mentee_1', status: 'active' }],
  }) as any);

  mock.method(DailyReminderSetting, 'findOne', () => ({
    lean: async () => ({
      mentorId: 'mentor_1',
      enabled: true,
      timezone: 'Asia/Kolkata',
      slots: [
        { slotIndex: 1, time: '17:00', enabled: true },
      ],
    }),
  }) as any);

  mock.method(Mentee, 'findById', () => ({
    lean: async () => ({
      _id: 'mentee_1',
      name: 'Rahul Sharma',
      status: 'active',
      userId: 'user_mentee_1',
    }),
  }) as any);

  mock.method(User, 'findById', () => ({
    lean: async () => ({
      _id: 'user_mentee_1',
      status: 'active',
    }),
  }) as any);

  mock.method(DailyPerformance, 'findOne', () => ({
    lean: async () => null,
  }) as any);

  // Notification for this slot ALREADY exists in database!
  mock.method(Notification, 'findOne', () => ({
    lean: async () => ({
      _id: 'notif_existing',
      idempotencyKey: 'daily-reminder:mentee_1:2026-10-09:slot1',
    }),
  }) as any);

  const notifCreateMock = mock.method(Notification, 'create', async () => {
    throw new Error('Should not call create when notification already exists');
  });

  const targetDate = new Date('2026-10-09T11:35:00.000Z');
  const result = await evaluateDailyProgressReminders(targetDate);

  // createNotification returns existing notification without creating new or sending push
  assert.equal(notifCreateMock.mock.callCount(), 0);
});
