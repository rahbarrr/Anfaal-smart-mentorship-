import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { User } from '../models/User.js';

const TEST_SECRET = 'test-jwt-secret-key-12345';
process.env.JWT_SECRET = TEST_SECRET;

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
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

test('AUTH: valid JWT checks the current active user and calls next', async () => {
  const token = jwt.sign(
    { id: 'user_123', email: 'mentor@anfaal.org', role: 'MENTOR' },
    TEST_SECRET,
    { expiresIn: '1h' },
  );

  const req: AuthRequest = {
    headers: { authorization: `Bearer ${token}` },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;
  const userLookup = mock.method(User, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: 'user_123', email: 'mentor@anfaal.org', role: 'MENTOR', status: 'active' }),
    }),
  }) as any);

  await new Promise<void>((resolve) => {
    requireAuth(req, res, () => {
      nextCalled = true;
      resolve();
    });
  });
  userLookup.mock.restore();

  assert.equal(nextCalled, true);
  assert.equal(req.user?.id, 'user_123');
  assert.equal(req.user?.role, 'MENTOR');
  assert.equal(req.user?.email, 'mentor@anfaal.org');
});

test('AUTH: disabled user is rejected even when the JWT is valid', async () => {
  const token = jwt.sign(
    { id: 'disabled_123', email: 'disabled@anfaal.org', role: 'MENTOR' },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
  const req: AuthRequest = { headers: { authorization: `Bearer ${token}` } } as any;
  const res = createMockResponse();
  const userLookup = mock.method(User, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: 'disabled_123', email: 'disabled@anfaal.org', role: 'MENTOR', status: 'disabled' }),
    }),
  }) as any);

  await new Promise<void>((resolve) => {
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      originalJson(data);
      resolve();
      return res;
    };
    requireAuth(req, res, () => resolve());
  });
  userLookup.mock.restore();

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Your session is no longer active. Please sign in again.');
});

test('AUTH: missing token returns 401', () => {
  const req: AuthRequest = { headers: {} } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Authentication required.');
});

test('AUTH: invalid JWT signature returns 401', () => {
  const token = jwt.sign({ id: 'user_123', role: 'MENTOR' }, 'wrong-secret');

  const req: AuthRequest = {
    headers: { authorization: `Bearer ${token}` },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid or expired token.');
});

test('AUTH: expired JWT token returns 401', () => {
  const token = jwt.sign(
    { id: 'user_123', role: 'ADMIN' },
    TEST_SECRET,
    { expiresIn: -10 }, // expired 10 seconds ago
  );

  const req: AuthRequest = {
    headers: { authorization: `Bearer ${token}` },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid or expired token.');
});

test('AUTH: JWT without required identity claims returns 401', () => {
  const token = jwt.sign({ id: 'user_123', role: 'MENTOR' }, TEST_SECRET);
  const req: AuthRequest = { headers: { authorization: `Bearer ${token}` } } as any;
  const res = createMockResponse();

  requireAuth(req, res, () => undefined);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid or expired token.');
});

test('AUTH: JWT with an invalid role returns 401', () => {
  const token = jwt.sign({ id: 'user_123', email: 'user@anfaal.org', role: 'SUPERUSER' }, TEST_SECRET);
  const req: AuthRequest = { headers: { authorization: `Bearer ${token}` } } as any;
  const res = createMockResponse();

  requireAuth(req, res, () => undefined);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid or expired token.');
});

test('AUTH: role authorization permits allowed role', () => {
  const req: AuthRequest = {
    user: { id: 'admin_1', email: 'admin@anfaal.org', role: 'ADMIN' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const adminOnly = requireRole('ADMIN');
  adminOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('AUTH: role authorization rejects unauthorized role with 403', () => {
  const req: AuthRequest = {
    user: { id: 'mentor_1', email: 'mentor@anfaal.org', role: 'MENTOR' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const adminOnly = requireRole('ADMIN');
  adminOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'You do not have access to this resource.');
});

test('AUTH: pending mentor access is blocked until admin approval', () => {
  const req: AuthRequest = {
    user: { id: 'mentor_1', email: 'mentor@anfaal.org', role: 'MENTOR', mentorApprovalStatus: 'PENDING' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const mentorOnly = requireRole('MENTOR');
  mentorOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'Your mentor account is pending approval.');
});

test('AUTH: rejected mentor access is blocked until new review', () => {
  const req: AuthRequest = {
    user: { id: 'mentor_2', email: 'mentor@anfaal.org', role: 'MENTOR', mentorApprovalStatus: 'REJECTED' },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  const mentorOnly = requireRole('MENTOR');
  mentorOnly(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'Your mentor application was rejected.');
});
