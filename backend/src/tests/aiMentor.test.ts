import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';
import aiMentorRoutes from '../routes/aiMentorRoutes.js';

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

test('AI MENTOR: /status returns remaining daily prompt count', async () => {
  const countMock = mock.fn(async () => 1);
  const origCollection = mongoose.connection.collection;
  mongoose.connection.collection = (() => ({
    countDocuments: countMock,
  })) as any;

  try {
    const req: any = {
      user: { id: 'user_mentee_1', role: 'MENTEE', menteeId: 'mentee_1' },
    };
    const res = createMockResponse();

    const route = (aiMentorRoutes as any).stack.find(
      (layer: any) => layer.route?.path === '/status' && layer.route?.methods?.get
    );
    assert.ok(route && route.route, 'GET /status route exists');

    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.dailyLimit, 3);
    assert.equal(res.body.promptsUsedToday, 1);
    assert.equal(res.body.promptsRemaining, 2);
  } finally {
    mongoose.connection.collection = origCollection;
  }
});

test('AI MENTOR: /chat rejects with 429 when daily prompt limit of 3 is reached', async () => {
  const countMock = mock.fn(async () => 3);
  const origCollection = mongoose.connection.collection;
  mongoose.connection.collection = (() => ({
    countDocuments: countMock,
  })) as any;

  try {
    const req: any = {
      body: { message: 'Can you help me plan today?' },
      user: { id: 'user_mentee_1', role: 'MENTEE', menteeId: 'mentee_1' },
      ip: '127.0.0.1',
    };
    const res = createMockResponse();

    const route = (aiMentorRoutes as any).stack.find(
      (layer: any) => layer.route?.path === '/chat' && layer.route?.methods?.post
    );
    assert.ok(route && route.route, 'POST /chat route exists');

    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res, () => {});

    assert.equal(res.statusCode, 429);
    assert.equal(res.body.dailyLimit, 3);
    assert.equal(res.body.promptsRemaining, 0);
    assert.ok(res.body.message.includes('daily limit of 3'));
  } finally {
    mongoose.connection.collection = origCollection;
  }
});

test('AI MENTOR: /chat rejects empty messages with 400', async () => {
  const origCollection = mongoose.connection.collection;
  mongoose.connection.collection = (() => ({
    countDocuments: async () => 0,
  })) as any;

  try {
    const req: any = {
      body: { message: '   ' },
      user: { id: 'user_mentee_1', role: 'MENTEE', menteeId: 'mentee_1' },
      ip: '127.0.0.1',
    };
    const res = createMockResponse();

    const route = (aiMentorRoutes as any).stack.find(
      (layer: any) => layer.route?.path === '/chat' && layer.route?.methods?.post
    );
    assert.ok(route && route.route, 'POST /chat route exists');

    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('between 1 and 2000'));
  } finally {
    mongoose.connection.collection = origCollection;
  }
});
