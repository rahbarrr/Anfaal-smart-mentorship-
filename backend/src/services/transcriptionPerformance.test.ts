import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedTranscriptionConcurrency } from './chunkedTranscriptionService.js';

test('PERFORMANCE: transcription concurrency is bounded for free-tier-safe processing', () => {
  assert.equal(normalizedTranscriptionConcurrency(undefined), 4);
  assert.equal(normalizedTranscriptionConcurrency(2), 2);
  assert.equal(normalizedTranscriptionConcurrency(20), 6);
  assert.equal(normalizedTranscriptionConcurrency(0), 1);
});
