import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TRANSCRIPTION_FILE_BYTES,
  RealTranscriptionService,
  MockTranscriptionService,
  createTranscriptionService,
  formatTimestamp,
  TranscriptionApiError,
  NonRetryableTranscriptionError,
} from '../services/transcriptionService.js';
import { RealAiSummaryService, MockAiSummaryService } from '../services/aiSummaryService.js';

test('PROCESSING: Mock transcription returns transcript with Unknown speaker, preserved timestamps, and mock flag', async () => {
  const service = new MockTranscriptionService();
  const result = await service.transcribe({
    buffer: Buffer.from('mock-audio'),
    originalname: 'recording.m4a',
    mimetype: 'audio/m4a',
  });

  assert.ok(result.text.length > 50);
  assert.ok(Array.isArray(result.segments));
  assert.ok(result.segments!.length > 0);
  assert.equal(result.language, 'en');
  assert.equal(result.isMock, true);
  assert.equal(result.provider, 'mock-transcription');
  // Never label segments as Mentor and Mentee without reliable diarization
  for (const seg of result.segments!) {
    assert.equal(seg.speaker, 'Unknown');
    assert.notEqual(seg.speaker, 'Mentor');
    assert.notEqual(seg.speaker, 'Mentee');
    assert.ok(typeof seg.start === 'number' && !Number.isNaN(seg.start));
    assert.ok(typeof seg.end === 'number' && !Number.isNaN(seg.end));
  }
});

test('PROCESSING: formatTimestamp preserves actual centisecond timestamps and avoids whole-second rounding', () => {
  assert.equal(formatTimestamp(0), '[00:00]');
  assert.equal(formatTimestamp(5), '[00:05]');
  assert.equal(formatTimestamp(65), '[01:05]');
  assert.equal(formatTimestamp(12.34), '[00:12.34]');
  assert.equal(formatTimestamp(75.5), '[01:15.50]');
  assert.equal(formatTimestamp(3661.12), '[61:01.12]');
});

test('PROCESSING: Real transcription preserves raw float timestamps without rounding and sets Unknown speaker', async () => {
  const service = new RealTranscriptionService();
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      text: 'Aapne kitna homework kiya aaj? Maine quadratic equations practice kiye.',
      language: 'hi',
      duration: 14.85,
      segments: [
        { id: 0, start: 0.12, end: 4.85, text: 'Aapne kitna homework kiya aaj?' },
        { id: 1, start: 5.15, end: 14.85, text: 'Maine quadratic equations practice kiye.' },
      ],
    }),
  } as any);

  try {
    const result = await service.transcribe({
      buffer: Buffer.from('dummy-audio-bytes'),
      originalname: 'recording.mp3',
      mimetype: 'audio/mpeg',
    });

    assert.equal(result.language, 'hi');
    assert.equal(result.segments?.length, 2);
    // Preserves float timestamps without rounding to whole seconds:
    assert.equal(result.segments![0].start, 0.12);
    assert.equal(result.segments![0].end, 4.85);
    assert.equal(result.segments![0].speaker, 'Unknown');
    assert.equal(result.segments![1].start, 5.15);
    assert.equal(result.segments![1].end, 14.85);
    assert.equal(result.segments![1].speaker, 'Unknown');
    // Segments formatted with actual centiseconds:
    assert.ok(result.text.includes('[00:00.12] Unknown: Aapne kitna homework kiya aaj?'));
    assert.ok(result.text.includes('[00:05.15] Unknown: Maine quadratic equations practice kiye.'));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('PROCESSING: Missing segments preserves full text directly without fake sentence timestamps', async () => {
  const service = new RealTranscriptionService();
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      text: 'First complete paragraph without segment markers. Second sentence here.',
      language: 'en',
      duration: 20,
      segments: [],
    }),
  } as any);

  try {
    const result = await service.transcribe({
      buffer: Buffer.from('dummy-audio-bytes'),
      originalname: 'recording.mp3',
      mimetype: 'audio/mpeg',
    });

    // Full text is preserved directly, no fake timestamps or estimated sentence duration
    assert.equal(result.text, 'First complete paragraph without segment markers. Second sentence here.');
    assert.deepEqual(result.segments, []);
    assert.equal(result.timestampsUnavailable, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('PROCESSING: Failed Whisper API calls throw meaningful error and never fall back to mock demo text', async () => {
  const service = new RealTranscriptionService();
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousAllowMock = process.env.ALLOW_MOCK_TRANSCRIPTION;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ALLOW_MOCK_TRANSCRIPTION = 'true';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => 'Bad Gateway from upstream AI cluster',
  } as any);

  try {
    await assert.rejects(
      async () => {
        await service.transcribe({
          buffer: Buffer.from('dummy-audio-bytes'),
          originalname: 'recording.mp3',
          mimetype: 'audio/mpeg',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TranscriptionApiError);
        assert.equal(err.status, 502);
        assert.match(err.message, /Whisper API responded with 502/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    if (previousAllowMock === undefined) delete process.env.ALLOW_MOCK_TRANSCRIPTION;
    else process.env.ALLOW_MOCK_TRANSCRIPTION = previousAllowMock;
  }
});

test('PROCESSING: ALLOW_MOCK_TRANSCRIPTION is strictly rejected in production', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAllowMock = process.env.ALLOW_MOCK_TRANSCRIPTION;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_MOCK_TRANSCRIPTION = 'true';

    assert.throws(
      () => createTranscriptionService(),
      (err: any) => {
        assert.ok(err instanceof NonRetryableTranscriptionError);
        assert.match(err.message, /ALLOW_MOCK_TRANSCRIPTION=true is strictly forbidden in production/);
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldAllowMock === undefined) delete process.env.ALLOW_MOCK_TRANSCRIPTION;
    else process.env.ALLOW_MOCK_TRANSCRIPTION = oldAllowMock;
  }
});

test('PROCESSING: Real transcription service fails if audio buffer is empty', async () => {
  const service = new RealTranscriptionService();
  await assert.rejects(
    async () => {
      await service.transcribe({
        buffer: Buffer.alloc(0),
        originalname: 'empty.m4a',
        mimetype: 'audio/m4a',
      });
    },
    { message: /Audio recording buffer is empty/ },
  );
});

test('PROCESSING: oversized audio is rejected before calling the transcription API', async () => {
  const service = new RealTranscriptionService();
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  try {
    await assert.rejects(
      service.transcribe({
        buffer: Buffer.alloc(MAX_TRANSCRIPTION_FILE_BYTES + 1),
        originalname: 'recording.mp3',
        mimetype: 'audio/mpeg',
      }),
      { message: /larger than 25 MB/ },
    );
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('PROCESSING: Real transcription service throws error in production when API key is missing', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldAllow = process.env.ALLOW_MOCK_TRANSCRIPTION;

  delete process.env.OPENAI_API_KEY;
  delete process.env.TRANSCRIPTION_API_KEY;
  process.env.ALLOW_MOCK_TRANSCRIPTION = 'false';

  const service = new RealTranscriptionService();
  try {
    await assert.rejects(
      async () => {
        await service.transcribe({
          buffer: Buffer.from('sample-audio-data'),
          originalname: 'recording.mp3',
          mimetype: 'audio/mpeg',
        });
      },
      { message: /Transcription API key is not configured/ },
    );
  } finally {
    process.env.OPENAI_API_KEY = oldKey;
    process.env.ALLOW_MOCK_TRANSCRIPTION = oldAllow;
  }
});

test('PROCESSING: Real AI summary service throws error in production when API key is missing', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldAllow = process.env.ALLOW_MOCK_AI;

  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_API_KEY;
  process.env.ALLOW_MOCK_AI = 'false';

  const service = new RealAiSummaryService();
  try {
    await assert.rejects(
      async () => {
        await service.summarize({
          transcript: 'Mentor: Assalamu Alaikum Arif. Mentee: Wa Alaikum Assalam.',
        });
      },
      { message: /AI API key is not configured/ },
    );
  } finally {
    process.env.OPENAI_API_KEY = oldKey;
    process.env.ALLOW_MOCK_AI = oldAllow;
  }
});

test('PROCESSING: Mock AI summary service generates structured summary', async () => {
  const service = new MockAiSummaryService();
  const summary = await service.summarize({
    transcript: 'Mentor: Assalamu Alaikum Arif. Mentee: Wa Alaikum Assalam.',
  });

  assert.ok(summary.shortSummary.length > 10);
  assert.ok(Array.isArray(summary.keyDiscussionPoints));
  assert.ok(Array.isArray(summary.actionItems));
  assert.ok(Array.isArray(summary.challenges));
  assert.ok(Array.isArray(summary.achievements));
});
