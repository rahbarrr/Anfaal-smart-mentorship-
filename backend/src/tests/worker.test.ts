import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createWorkerHealthServer } from '../workerHealthServer.js';

test('WORKER: health endpoint responds with a simple healthy status', async () => {
  const server = createWorkerHealthServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Connection: 'close' },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('WORKER: health server does not expose any other routes', async () => {
  const server = createWorkerHealthServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const response = await fetch(`http://127.0.0.1:${address.port}/`, {
      headers: { Connection: 'close' },
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});