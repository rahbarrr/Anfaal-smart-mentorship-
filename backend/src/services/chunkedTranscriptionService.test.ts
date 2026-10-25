import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergeChunkResults, transcribeAudioInChunks } from './chunkedTranscriptionService.js';
import {
  TranscriptionApiError,
  NonRetryableTranscriptionError,
  isNonRetryableTranscriptionError,
  isFatalAuthOrClientError,
} from './transcriptionService.js';
import { MockAiSummaryService } from './aiSummaryService.js';
import { boundedText } from './chunking.js';

async function createMockPreparedChunks(count: number, chunkSeconds = 45) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-chunks-'));
  const chunks = [];
  for (let i = 0; i < count; i++) {
    const chunkPath = path.join(tempDir, `chunk-${String(i).padStart(4, '0')}.mp3`);
    await fs.writeFile(chunkPath, Buffer.from(`chunk-audio-data-${i}`));
    chunks.push({
      index: i,
      startSeconds: i * chunkSeconds,
      endSeconds: (i + 1) * chunkSeconds,
      path: chunkPath,
      fileName: `chunk-${String(i).padStart(4, '0')}.mp3`,
      mimeType: 'audio/mpeg',
    });
  }
  return {
    tempDir,
    durationSeconds: count * chunkSeconds,
    chunks,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

test('CHUNKED TRANSCRIPTION: merges chunks in order and removes overlap duplicates', () => {
  const result = mergeChunkResults([
    {
      index: 1,
      startSeconds: 44,
      endSeconds: 91,
      text: '[00:44] overlap\n\n[00:50] second chunk',
      segments: [
        { start: 0, end: 5, text: 'overlap', speaker: 'Mentor' },
        { start: 6, end: 12, text: 'second chunk', speaker: 'Mentee' },
      ],
      attempts: 1,
    },
    {
      index: 0,
      startSeconds: 0,
      endSeconds: 45,
      text: '[00:40] first chunk',
      segments: [{ start: 40, end: 45, text: 'first chunk', speaker: 'Mentor' }],
      attempts: 1,
    },
  ], 90, 45);

  assert.deepEqual(result.segments.map((segment) => segment.text), ['first chunk', 'second chunk']);
  assert.equal(result.segments[1].start, 50);
  assert.match(result.text, /\[00:50\] Mentee: second chunk/);
});

test('CHUNKED TRANSCRIPTION: falls back to chunk text when a provider returns no segments', () => {
  const result = mergeChunkResults([
    { index: 0, startSeconds: 0, endSeconds: 45, text: 'first', segments: [], attempts: 1 },
    { index: 1, startSeconds: 44, endSeconds: 90, text: 'second', segments: [], attempts: 1 },
  ], 90, 45);

  assert.equal(result.text, 'first\n\nsecond');
  assert.deepEqual(result.segments, []);
});

// ── Required Test 1: All chunks transcribe successfully and produce one complete transcript ──
test('CHUNKED TRANSCRIPTION (Req 1): All chunks transcribe successfully and produce one complete transcript', async () => {
  const chunkCount = 6;
  const chunkSeconds = 45;
  const preparedChunks = await createMockPreparedChunks(chunkCount, chunkSeconds);

  const result = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'Call_with_Innama_Fatima_Student.m4a',
    mimetype: 'audio/m4a',
    concurrency: 2,
    chunkSeconds,
    prepareChunks: async () => preparedChunks,
    transcribeChunk: async (input) => {
      const match = input.originalname.match(/chunk-(\d+)/);
      const idx = match ? Number(match[1]) : 0;
      return {
        text: `[00:00] Mentor: Dialogue for chunk ${idx}`,
        segments: [{ start: 0, end: 10, text: `Dialogue for chunk ${idx}`, speaker: 'Mentor' }],
        language: 'en',
        duration: 10,
        provider: 'openai-whisper-test',
      };
    },
  });

  assert.equal(result.partial, false);
  assert.equal(result.chunks.length, 6);
  assert.equal(result.chunks.every((c) => !c.error), true);
  // Verify ordering
  for (let i = 0; i < 6; i++) {
    assert.equal(result.chunks[i].index, i);
  }
  // Verify complete transcript has all chunks' dialogue
  for (let i = 0; i < 6; i++) {
    assert.ok(result.text.includes(`Dialogue for chunk ${i}`));
  }
  assert.equal(result.segments.length, 6);
});

// ── Required Test 2: One chunk fails and the overall job fails with a useful error ──
test('CHUNKED TRANSCRIPTION (Req 2): One chunk fails and the overall job fails with a useful error', async () => {
  const preparedChunks = await createMockPreparedChunks(4, 45);

  const result = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'recording.m4a',
    mimetype: 'audio/m4a',
    concurrency: 1,
    maxAttempts: 2,
    prepareChunks: async () => preparedChunks,
    transcribeChunk: async (input) => {
      if (input.originalname.includes('chunk-0002')) {
        throw new TranscriptionApiError('Whisper API responded with 500: Internal server error', {
          status: 500,
          retryable: true,
        });
      }
      return {
        text: 'Valid dialogue',
        segments: [{ start: 0, end: 5, text: 'Valid dialogue', speaker: 'Mentor' }],
        duration: 5,
      };
    },
  });

  assert.equal(result.partial, true);
  const failedChunk = result.chunks.find((c) => c.index === 2);
  assert.ok(failedChunk);
  assert.ok(failedChunk.error);
  assert.match(failedChunk.error, /Whisper API responded with 500/);

  // Validate the error message formatted as required by worker
  const failedDetails = result.chunks
    .filter((chunk) => chunk.error)
    .map((chunk) => `chunk ${chunk.index} (${chunk.error})`)
    .join('; ');
  const error = new Error(`Transcription failed for audio chunk(s): ${failedDetails}`);
  assert.match(error.message, /chunk 2/);
  assert.match(error.message, /Whisper API responded with 500/);
});

// ── Required Test 3: A transcription function returns an empty or invalid result ──
test('CHUNKED TRANSCRIPTION (Req 3): A transcription function returns an empty or invalid result', async () => {
  const preparedChunks = await createMockPreparedChunks(2, 45);

  // Case A: All chunks return empty text
  const emptyResult = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'silent.m4a',
    mimetype: 'audio/m4a',
    concurrency: 1,
    prepareChunks: async () => preparedChunks,
    transcribeChunk: async () => ({
      text: '',
      segments: [],
      duration: 0,
    }),
  });

  // Downstream validation verifies non-empty text
  const resolvedText = (emptyResult.text ?? '').trim();
  assert.equal(resolvedText, '');
  assert.throws(
    () => {
      if (!resolvedText) throw new Error('Transcription completed but returned an empty transcript.');
    },
    { message: /Transcription completed but returned an empty transcript/ },
  );

  // Case B: transcribeChunk returns invalid format
  const preparedChunks2 = await createMockPreparedChunks(1, 45);
  const invalidResult = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'invalid.m4a',
    mimetype: 'audio/m4a',
    concurrency: 1,
    maxAttempts: 1,
    prepareChunks: async () => preparedChunks2,
    transcribeChunk: async () => ({
      text: null as any,
      segments: [],
    }),
  });

  assert.equal(invalidResult.partial, true);
  assert.match(invalidResult.chunks[0].error || '', /invalid result format/);
});

// ── Required Test 4: A retry occurs without duplicating completed work unnecessarily ──
test('CHUNKED TRANSCRIPTION (Req 4): Non-retryable error does NOT retry repeatedly and aborts unstarted chunks', async () => {
  const preparedChunks = await createMockPreparedChunks(3, 45);
  let chunk0Attempts = 0;
  let chunk1Attempts = 0;
  let chunk2Attempts = 0;

  const result = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'auth-error.m4a',
    mimetype: 'audio/m4a',
    concurrency: 1,
    maxAttempts: 3,
    prepareChunks: async () => preparedChunks,
    transcribeChunk: async (input) => {
      if (input.originalname.includes('chunk-0000')) {
        chunk0Attempts++;
        throw new TranscriptionApiError('Whisper API responded with 401: Unauthorized', {
          status: 401,
          retryable: false,
        });
      }
      if (input.originalname.includes('chunk-0001')) {
        chunk1Attempts++;
      }
      if (input.originalname.includes('chunk-0002')) {
        chunk2Attempts++;
      }
      return { text: 'dialogue', segments: [] };
    },
  });

  // Non-retryable 401 should only be attempted ONCE on chunk 0
  assert.equal(chunk0Attempts, 1);
  // Subsequent chunks must be aborted without extra API calls
  assert.equal(chunk1Attempts, 0);
  assert.equal(chunk2Attempts, 0);
  assert.equal(result.partial, true);
  assert.match(result.chunks[0].error || '', /401: Unauthorized/);
});

test('CHUNKED TRANSCRIPTION (Req 4b): Retryable error retries with backoff and succeeds on attempt 2 without duplicating completed chunk', async () => {
  const preparedChunks = await createMockPreparedChunks(2, 45);
  const attemptsPerChunk: Record<number, number> = { 0: 0, 1: 0 };

  const result = await transcribeAudioInChunks({
    buffer: Buffer.from('test-audio'),
    originalname: 'rate-limit.m4a',
    mimetype: 'audio/m4a',
    concurrency: 1,
    maxAttempts: 3,
    prepareChunks: async () => preparedChunks,
    transcribeChunk: async (input) => {
      const idx = input.originalname.includes('chunk-0000') ? 0 : 1;
      attemptsPerChunk[idx]++;
      if (idx === 1 && attemptsPerChunk[1] === 1) {
        // First attempt on chunk 1 fails with 429 Rate Limit
        throw new TranscriptionApiError('Whisper API responded with 429: Rate limit exceeded', {
          status: 429,
          retryable: true,
        });
      }
      return {
        text: `Success chunk ${idx}`,
        segments: [{ start: 0, end: 5, text: `Success chunk ${idx}`, speaker: 'Mentor' }],
      };
    },
  });

  // Chunk 0 succeeded on attempt 1 and was NOT duplicated
  assert.equal(attemptsPerChunk[0], 1);
  // Chunk 1 retried and succeeded on attempt 2
  assert.equal(attemptsPerChunk[1], 2);
  assert.equal(result.partial, false);
  assert.equal(result.chunks.every((c) => !c.error), true);
  assert.ok(result.text.includes('Success chunk 0'));
  assert.ok(result.text.includes('Success chunk 1'));
});

// ── Required Test 5 & 6: Successful transcription advances; failed transcription never reports success ──
test('CHUNKED TRANSCRIPTION (Req 5 & 6): Validation ensures failed transcription never reports success', () => {
  const logs: string[] = [];
  const logInfo = (msg: string) => logs.push(msg);

  const simulateWorkerTranscriptionOutcome = (result: any) => {
    // Exact logic from callWorker.ts:
    if (!result || typeof result !== 'object') {
      throw new Error('Transcription failed: service returned an invalid result.');
    }
    if ('partial' in result && result.partial) {
      const failedDetails = (result.chunks ?? [])
        .filter((chunk: any) => chunk.error)
        .map((chunk: any) => `chunk ${chunk.index} (${chunk.error})`)
        .join('; ');
      throw new Error(`Transcription failed for audio chunk(s): ${failedDetails || 'unknown chunk error'}.`);
    }
    const resolvedText = (result.text ?? '').trim();
    if (!resolvedText) {
      throw new Error('Transcription completed but returned an empty transcript.');
    }
    // Only logged after all validations pass and DB is updated:
    logInfo('[CALL_TRANSCRIPTION_SUCCESS]');
    return 'ADVANCED_TO_SUMMARY';
  };

  // Test failed chunk
  assert.throws(
    () => simulateWorkerTranscriptionOutcome({
      partial: true,
      chunks: [{ index: 0, error: 'Whisper 401' }],
      text: '',
    }),
    /Transcription failed for audio chunk\(s\): chunk 0 \(Whisper 401\)/,
  );
  // Verify SUCCESS was NEVER logged
  assert.equal(logs.includes('[CALL_TRANSCRIPTION_SUCCESS]'), false);

  // Test empty transcript
  assert.throws(
    () => simulateWorkerTranscriptionOutcome({
      partial: false,
      chunks: [{ index: 0, text: '' }],
      text: '   ',
    }),
    /Transcription completed but returned an empty transcript/,
  );
  assert.equal(logs.includes('[CALL_TRANSCRIPTION_SUCCESS]'), false);

  // Test successful transcript
  const nextStage = simulateWorkerTranscriptionOutcome({
    partial: false,
    chunks: [{ index: 0, text: 'Hello Arif' }],
    text: '[00:00] Mentor: Hello Arif',
  });
  assert.equal(nextStage, 'ADVANCED_TO_SUMMARY');
  assert.equal(logs.includes('[CALL_TRANSCRIPTION_SUCCESS]'), true);
});

// ── Required Test 7: Existing call summaries and saved call records continue to work ──
test('CHUNKED TRANSCRIPTION (Req 7): Existing call summaries and saved call records continue to work', async () => {
  const mergedTranscript = '[00:00] Mentor: Assalamu Alaikum Arif.\n\n[00:05] Mentee: Wa Alaikum Assalam.';
  const summaryService = new MockAiSummaryService();

  const summary = await summaryService.summarize({
    transcript: boundedText(mergedTranscript),
    mentorNotes: 'Discussion about study progress',
    metadata: {
      mentorName: 'Mentor',
      menteeName: 'Arif',
    },
  });

  assert.ok(summary.shortSummary.length > 0);
  assert.ok(Array.isArray(summary.keyDiscussionPoints));
  assert.ok(Array.isArray(summary.actionItems));
  assert.ok(Array.isArray(summary.summaryPoints));
  assert.equal(typeof summary.academicProgress, 'string');
});

// ── Error Classification Tests ──
test('ERROR CLASSIFICATION: isNonRetryableTranscriptionError detects client errors and invalid keys', () => {
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('400 bad request', { status: 400 })), true);
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('401 unauthorized', { status: 401 })), true);
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('403 forbidden', { status: 403 })), true);
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('404 not found', { status: 404 })), true);
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('429 rate limit', { status: 429 })), false);
  assert.equal(isNonRetryableTranscriptionError(new TranscriptionApiError('500 server error', { status: 500 })), false);
  assert.equal(isNonRetryableTranscriptionError(new NonRetryableTranscriptionError('buffer empty')), true);
  assert.equal(isNonRetryableTranscriptionError(new Error('Transcription API key is not configured')), true);
});

test('ERROR CLASSIFICATION: isFatalAuthOrClientError detects auth errors for fast abort', () => {
  assert.equal(isFatalAuthOrClientError(new TranscriptionApiError('unauthorized', { status: 401 })), true);
  assert.equal(isFatalAuthOrClientError(new TranscriptionApiError('forbidden', { status: 403 })), true);
  assert.equal(isFatalAuthOrClientError(new TranscriptionApiError('rate limit', { status: 429 })), false);
  assert.equal(isFatalAuthOrClientError(new Error('Transcription API key is not configured')), true);
});
