import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveJobFresh } from '../services/jobRecoveryService.js';

test('JOB STATUS: active heartbeat is not stale', () => {
  assert.equal(isActiveJobFresh({ status: 'PROCESSING', heartbeatAt: new Date() }), true);
});

test('JOB STATUS: old pending job is marked eligible for recovery', () => {
  assert.equal(isActiveJobFresh({ status: 'PENDING', updatedAt: new Date(Date.now() - 31 * 60 * 1000) }), false);
});
