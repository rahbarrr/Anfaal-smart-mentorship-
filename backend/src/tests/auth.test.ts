import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';

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

test('AUTH: valid JWT sets user on request and calls next', () => {
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

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user?.id, 'user_123');
  assert.equal(req.user?.role, 'MENTOR');
  assert.equal(req.user?.email, 'mentor@anfaal.org');
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
