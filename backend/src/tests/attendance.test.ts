import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';
import {
  recordAutomaticDailyAttendance,
  recordManualAttendance,
  calculateAttendanceStats,
} from '../services/attendanceService.js';
import { Attendance } from '../models/Attendance.js';
import { Mentee } from '../models/Mentee.js';

test('ATTENDANCE (Scenario 1): Mentee submits Daily Progress successfully -> creates PRESENT attendance with source Daily Progress', async () => {
  const menteeId = '507f1f77bcf86cd799439011';
  const date = '2026-11-01';

  mock.method(Mentee, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: menteeId }),
    }),
  }) as any);

  mock.method(Attendance, 'findOne', async () => null);

  const mockCreated = {
    _id: new mongoose.Types.ObjectId(),
    menteeId,
    date,
    month: '2026-11',
    status: 'PRESENT',
    source: 'Daily Progress',
    isManual: false,
    createdBy: menteeId,
    toObject: () => ({
      menteeId,
      date,
      status: 'PRESENT',
      source: 'Daily Progress',
    }),
  };

  const createMock = mock.method(Attendance, 'create', async () => mockCreated as any);

  const result = await recordAutomaticDailyAttendance(menteeId, date, menteeId);

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(result.created, true);
  assert.equal(result.record?.status, 'PRESENT');
  assert.equal(result.record?.source, 'Daily Progress');
});

test('ATTENDANCE (Scenario 3 & 10): Multiple submissions on same date do not create duplicate attendance records', async () => {
  const menteeId = '507f1f77bcf86cd799439011';
  const date = '2026-11-01';

  mock.method(Mentee, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: menteeId }),
    }),
  }) as any);

  const existingAttendance = {
    _id: new mongoose.Types.ObjectId(),
    menteeId,
    date,
    month: '2026-11',
    status: 'PRESENT',
    source: 'Daily Progress',
    isManual: false,
    toObject: () => ({
      menteeId,
      date,
      status: 'PRESENT',
      source: 'Daily Progress',
    }),
  };

  mock.method(Attendance, 'findOne', async () => existingAttendance as any);
  const createMock = mock.method(Attendance, 'create', async () => {
    throw new Error('Should not be called if record exists');
  });

  const result = await recordAutomaticDailyAttendance(menteeId, date, menteeId);

  assert.equal(createMock.mock.callCount(), 0);
  assert.equal(result.created, false);
  assert.equal(result.preservedPresent, true);
  assert.equal(result.record?.status, 'PRESENT');
});

test('ATTENDANCE (Scenario 7): Mentor manual correction is preserved and NOT overwritten by subsequent Daily Progress', async () => {
  const menteeId = '507f1f77bcf86cd799439011';
  const date = '2026-11-01';

  mock.method(Mentee, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: menteeId }),
    }),
  }) as any);

  // Mentor previously marked mentee as ABSENT with manual flag
  const manualRecord = {
    _id: new mongoose.Types.ObjectId(),
    menteeId,
    date,
    month: '2026-11',
    status: 'ABSENT',
    source: 'MANUAL',
    isManual: true,
    notes: 'Excused sick leave verified by mentor',
    toObject: () => ({
      menteeId,
      date,
      status: 'ABSENT',
      source: 'MANUAL',
      isManual: true,
    }),
  };

  mock.method(Attendance, 'findOne', async () => manualRecord as any);

  const result = await recordAutomaticDailyAttendance(menteeId, date, menteeId);

  assert.equal(result.created, false);
  assert.equal(result.updated, false);
  assert.equal(result.preservedManual, true);
  assert.equal(result.record?.status, 'ABSENT');
  assert.equal(result.record?.source, 'MANUAL');
});

test('ATTENDANCE (Scenario 13): Does not create attendance for admin or mentor accounts', async () => {
  const nonMenteeId = '507f1f77bcf86cd799439099';
  const date = '2026-11-01';

  mock.method(Mentee, 'findById', () => ({
    select: () => ({
      lean: async () => null, // Mentee not found
    }),
  }) as any);

  const createMock = mock.method(Attendance, 'create', async () => {
    throw new Error('Should not create attendance');
  });

  const result = await recordAutomaticDailyAttendance(nonMenteeId, date, 'admin_user');

  assert.equal(createMock.mock.callCount(), 0);
  assert.equal(result.record, null);
  assert.equal(result.created, false);
});

test('ATTENDANCE (Scenario 8): calculateAttendanceStats correctly computes presence percentage and totals', () => {
  const records = [
    { status: 'PRESENT' as const },
    { status: 'PRESENT' as const },
    { status: 'PRESENT' as const },
    { status: 'ABSENT' as const },
  ];

  const stats = calculateAttendanceStats(records);
  assert.equal(stats.present, 3);
  assert.equal(stats.absent, 1);
  assert.equal(stats.total, 4);
  assert.equal(stats.percentage, 75); // 3 / 4 = 75%
});

test('ATTENDANCE (Scenario 8b): calculateAttendanceStats handles empty record array gracefully', () => {
  const stats = calculateAttendanceStats([]);
  assert.equal(stats.present, 0);
  assert.equal(stats.absent, 0);
  assert.equal(stats.total, 0);
  assert.equal(stats.percentage, 0);
});

test('ATTENDANCE (Scenario 5): Concurrent insertion race condition catches 11000 duplicate key safely', async () => {
  const menteeId = '507f1f77bcf86cd799439011';
  const date = '2026-11-01';

  mock.method(Mentee, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: menteeId }),
    }),
  }) as any);

  let findCount = 0;
  mock.method(Attendance, 'findOne', async () => {
    findCount++;
    if (findCount === 1) return null; // First check returns null, simulates both concurrent threads seeing no record
    return {
      _id: new mongoose.Types.ObjectId(),
      menteeId,
      date,
      status: 'PRESENT',
      source: 'Daily Progress',
      toObject: () => ({ menteeId, date, status: 'PRESENT', source: 'Daily Progress' }),
    } as any;
  });

  // Create throws E11000 duplicate key error simulating parallel write collision
  mock.method(Attendance, 'create', async () => {
    const error: any = new Error('E11000 duplicate key error collection: attendance index: menteeId_1_date_1');
    error.code = 11000;
    throw error;
  });

  const result = await recordAutomaticDailyAttendance(menteeId, date, menteeId);

  assert.equal(result.created, false);
  assert.equal(result.record?.status, 'PRESENT');
});

test('ATTENDANCE: recordManualAttendance updates isManual flag and custom notes', async () => {
  const menteeId = '507f1f77bcf86cd799439011';
  const date = '2026-11-02';
  const userId = 'mentor_user_99';

  mock.method(Attendance, 'findOne', async () => null);

  const mockUpserted = {
    _id: new mongoose.Types.ObjectId(),
    menteeId,
    date,
    month: '2026-11',
    status: 'ABSENT',
    source: 'MANUAL',
    isManual: true,
    notes: 'Family emergency',
    manuallyCorrectedBy: userId,
    toObject: () => ({
      menteeId,
      date,
      status: 'ABSENT',
      source: 'MANUAL',
      isManual: true,
      notes: 'Family emergency',
    }),
  };

  mock.method(Attendance, 'findOneAndUpdate', async () => mockUpserted as any);

  const result = await recordManualAttendance({
    menteeId,
    date,
    status: 'ABSENT',
    notes: 'Family emergency',
    userId,
  });

  assert.equal(result.status, 'ABSENT');
  assert.equal(result.isManual, true);
  assert.equal(result.notes, 'Family emergency');
});

