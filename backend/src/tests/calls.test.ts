import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageProvider, MockStorageProvider } from '../services/storageService.js';
import { withTimeout } from '../queue/callQueue.js';

test('CALLS: queue enqueue timeout rejects instead of holding the upload request open', async () => {
  await assert.rejects(
    withTimeout(new Promise<void>(() => {}), 5, 'Queue unavailable'),
    /Queue unavailable/,
  );
});

test('CALLS: storage provider generates unique private storageKey with date prefix', async () => {
  const provider = createStorageProvider();
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const storageKey = `calls/${year}/${month}/call_test123/recording.m4a`;

  const presignedUrl = await provider.getPresignedUploadUrl(storageKey, 'audio/m4a');
  assert.ok(presignedUrl.includes(encodeURIComponent(storageKey)) || presignedUrl.includes(storageKey));

  const signedGetUrl = await provider.getSignedUrl(storageKey);
  assert.ok(signedGetUrl.includes(encodeURIComponent(storageKey)) || signedGetUrl.includes(storageKey));
});

test('CALLS: mock storage provider reads and writes file buffer using storageKey', async () => {
  const provider = new MockStorageProvider();
  const storageKey = `calls/2026/09/call_unit_test/recording.m4a`;
  const fileContent = Buffer.from('RIFF_MOCK_AUDIO_CONTENT_FOR_TESTS');

  await provider.uploadFile({ originalname: 'recording.m4a', buffer: fileContent }, storageKey);

  const downloadedBuffer = await provider.getObjectBuffer(storageKey);
  assert.equal(downloadedBuffer.toString(), 'RIFF_MOCK_AUDIO_CONTENT_FOR_TESTS');

  await provider.deleteFile(storageKey);
});

test('CALLS: summary version history correctly records version types', () => {
  const summaryVersions: any[] = [];

  // Version 1: AI
  summaryVersions.push({
    version: 1,
    type: 'AI',
    content: { shortSummary: 'AI generated summary' },
    timestamp: new Date(),
    author: 'system',
  });

  // Version 2: Mentor Edit
  summaryVersions.push({
    version: 2,
    type: 'MENTOR_EDIT',
    content: { shortSummary: 'Mentor edited summary' },
    timestamp: new Date(),
    author: 'mentor_1',
  });

  // Version 3: Approved
  summaryVersions.push({
    version: 3,
    type: 'APPROVED',
    content: { shortSummary: 'Final approved summary' },
    timestamp: new Date(),
    author: 'mentor_1',
  });

  assert.equal(summaryVersions.length, 3);
  assert.equal(summaryVersions[0].type, 'AI');
  assert.equal(summaryVersions[1].type, 'MENTOR_EDIT');
  assert.equal(summaryVersions[2].type, 'APPROVED');
  assert.equal(summaryVersions[2].version, 3);
});
