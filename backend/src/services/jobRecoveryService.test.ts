import test from 'node:test';
import assert from 'node:assert/strict';
import { getJobStaleTimeoutMs, isActiveJobFresh, isJobRunnable } from './jobRecoveryService.js';

test('JOB RECOVERY: fresh pending and processing jobs block duplicate retries', () => {
  const now = new Date();
  assert.equal(isActiveJobFresh({ status: 'PENDING', updatedAt: now }), true);
  assert.equal(isActiveJobFresh({ status: 'PROCESSING', heartbeatAt: now }), true);
  assert.equal(isActiveJobFresh({ status: 'COMPLETED', updatedAt: now }), false);
});

test('JOB RECOVERY: old heartbeats are eligible for recovery', () => {
  const old = new Date(Date.now() - 31 * 60 * 1000);
  assert.equal(isActiveJobFresh({ status: 'PROCESSING', heartbeatAt: old }), false);
  assert.equal(isActiveJobFresh({ status: 'PENDING', updatedAt: old }), false);
});

test('JOB RECOVERY: queued jobs recover sooner than active processing jobs', () => {
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
  assert.equal(isActiveJobFresh({ status: 'PENDING', updatedAt: sixMinutesAgo }), false);
  assert.equal(isActiveJobFresh({ status: 'PROCESSING', heartbeatAt: sixMinutesAgo }), true);
  assert.equal(getJobStaleTimeoutMs('PENDING') < getJobStaleTimeoutMs('PROCESSING'), true);
});

test('JOB RECOVERY: only pending and processing jobs can run', () => {
  assert.equal(isJobRunnable('PENDING'), true);
  assert.equal(isJobRunnable('PROCESSING'), true);
  assert.equal(isJobRunnable('FAILED'), false);
  assert.equal(isJobRunnable('COMPLETED'), false);
});
