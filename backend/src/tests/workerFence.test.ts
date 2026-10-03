import test from 'node:test';
import assert from 'node:assert/strict';
import { isJobRunnable } from '../queue/callWorker.js';

test('WORKER FENCE: only active database jobs may execute', () => {
  assert.equal(isJobRunnable('PENDING'), true);
  assert.equal(isJobRunnable('PROCESSING'), true);
  assert.equal(isJobRunnable('FAILED'), false);
  assert.equal(isJobRunnable('COMPLETED'), false);
  assert.equal(isJobRunnable('UNKNOWN'), false);
});
