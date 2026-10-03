import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProcessingError } from './processingErrorService.js';
import { NonRetryableTranscriptionError } from './transcriptionService.js';

test('PROCESSING ERRORS: invalid transcription input is permanent', () => {
  assert.deepEqual(
    classifyProcessingError(new NonRetryableTranscriptionError('unsupported audio format'), 'transcription'),
    { code: 'INVALID_INPUT', retryable: false },
  );
});

test('PROCESSING ERRORS: storage and summary failures are retryable', () => {
  assert.deepEqual(classifyProcessingError(new Error('S3 download timed out'), 'transcription'), { code: 'STORAGE_FAILED', retryable: true });
  assert.deepEqual(classifyProcessingError(new Error('OpenAI summary timeout'), 'summary'), { code: 'SUMMARY_FAILED', retryable: true });
});

test('PROCESSING ERRORS: audio safety limits are permanent input failures', () => {
  assert.deepEqual(
    classifyProcessingError(new Error('Audio preparation failed: Recording exceeds the maximum supported duration of 6 hours.'), 'transcription'),
    { code: 'INVALID_INPUT', retryable: false },
  );
});
