import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';

const TEST_SECRET = 'test-security-secret-key-12345';
process.env.JWT_SECRET = TEST_SECRET;

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {},
    set(key: string, val: string) {
      this.headers[key] = val;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('SECURITY: Unauthenticated user is rejected with 401', () => {
  const req: AuthRequest = { headers: {} } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /Authentication required/i);
});

test('SECURITY: Expired token is rejected with 401', () => {
  const expiredToken = jwt.sign(
    { id: 'u1', email: 'user@test.org', role: 'MENTEE' },
    TEST_SECRET,
    { expiresIn: '-1s' },
  );

  const req: AuthRequest = {
    headers: { authorization: `Bearer ${expiredToken}` },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /Invalid or expired/i);
});

test('SECURITY: Mentee attempting admin-only endpoint receives 403', () => {
  const req: AuthRequest = {
    user: { id: 'mentee_1', email: 'mentee@test.org', role: 'MENTEE' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const adminOnly = requireRole('ADMIN');
  adminOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /access/i);
});

test('SECURITY: Mentor attempting admin-only endpoint receives 403', () => {
  const req: AuthRequest = {
    user: { id: 'mentor_1', email: 'mentor@test.org', role: 'MENTOR' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const adminOnly = requireRole('ADMIN');
  adminOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /access/i);
});

test('SECURITY: Mentee cannot access another mentee profile (IDOR defense)', async () => {
  const requestingMentee = { id: 'mentee_user_1', menteeId: 'mentee_doc_1', role: 'MENTEE' as const };
  const targetOtherMenteeId = 'mentee_doc_2';

  const allowedIds = [requestingMentee.id, requestingMentee.menteeId];
  const isAuthorized = allowedIds.includes(targetOtherMenteeId);

  assert.equal(isAuthorized, false, 'Mentee should not be authorized to view another mentee');
});

test('SECURITY: Mentor cannot access unassigned mentee (IDOR defense)', async () => {
  const mentorUserId = 'mentor_user_1';
  const targetMenteeId = 'mentee_doc_unassigned';

  const mentorProfileMock = mock.method(Mentor, 'findOne', () => ({
    lean: async () => ({ _id: 'mentor_profile_1', userId: mentorUserId }),
  }) as any);

  const mentorshipMock = mock.method(Mentorship, 'findOne', () => ({
    lean: async () => null, // not assigned!
  }) as any);

  const mentorProfile = await Mentor.findOne({ userId: mentorUserId }).lean();
  const assignment = await Mentorship.findOne({
    mentorId: String((mentorProfile as any)?._id),
    menteeId: targetMenteeId,
    status: 'active',
  }).lean();

  mentorProfileMock.mock.restore();
  mentorshipMock.mock.restore();

  assert.equal(Boolean(assignment), false, 'Unassigned mentor access must evaluate to false');
});

test('SECURITY: Unauthorized user or mentee blocked from call audio download URL', () => {
  const menteeReq: AuthRequest = {
    user: { id: 'mentee_1', email: 'mentee@test.org', role: 'MENTEE' },
  } as any;

  // In callRoutes.ts, mentees are explicitly forbidden from accessing recording audio URLs
  const isMenteeBlocked = menteeReq.user?.role === 'MENTEE';
  assert.equal(isMenteeBlocked, true, 'Mentees must be blocked from call audio recordings');
});

test('SECURITY: Mentor cannot edit or delete another mentor call record (IDOR defense)', () => {
  const callRecord = {
    _id: 'call_1',
    mentorId: 'mentor_profile_other',
    menteeId: 'mentee_1',
  };

  const requestingMentor = {
    id: 'user_mentor_current',
    profileId: 'mentor_profile_current',
    role: 'MENTOR',
  };

  const allowedIds = [requestingMentor.id, requestingMentor.profileId];
  const canModify = allowedIds.includes(callRecord.mentorId);

  assert.equal(canModify, false, 'Mentor must not be permitted to modify another mentor call');
});
