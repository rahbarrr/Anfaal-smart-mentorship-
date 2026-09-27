import assert from 'node:assert/strict';
import test from 'node:test';
import { RealTranscriptionService, MockTranscriptionService } from '../services/transcriptionService.js';
import { RealAiSummaryService, MockAiSummaryService } from '../services/aiSummaryService.js';

test('PROCESSING: Mock transcription returns diarized transcript with timestamps and speakers', async () => {
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
});

test('PROCESSING: Real transcription service fails if audio buffer is empty', async () => {
  const service = new RealTranscriptionService();
  await assert.rejects(
    async () => {
      await service.transcribe({
        originalname: 'empty.m4a',
        mimetype: 'audio/m4a',
      });
    },
    { message: /No audio recording buffer available for transcription/ },
  );
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
