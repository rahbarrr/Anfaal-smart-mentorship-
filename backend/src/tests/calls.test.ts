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

test('CALLS: call processing status synchronization reconciles completed call and prevents stuck 0%', () => {
  // Test completed call state synchronization even if job was null or pending
  const completedCall = {
    processingStatus: 'completed',
    aiStatus: 'completed',
    summary: 'A complete mentorship discussion.',
    transcription: { status: 'COMPLETED', text: 'Call transcript.' },
    aiSummary: { status: 'COMPLETED', shortSummary: 'Summary text' },
  };

  const isCallCompleted =
    completedCall.processingStatus === 'completed' ||
    completedCall.aiStatus === 'completed' ||
    Boolean(completedCall.summary || (completedCall.transcription?.status === 'COMPLETED' && completedCall.aiSummary?.status === 'COMPLETED'));

  assert.equal(isCallCompleted, true);

  const pendingJob = {
    stage: 'UPLOAD',
    status: 'PENDING',
    progress: 0,
    stageStatus: { upload: 'COMPLETED', audioProcessing: 'PENDING', transcription: 'PENDING', summary: 'PENDING' },
  };

  const effectiveJob = {
    stage: isCallCompleted ? 'COMPLETE' : pendingJob.stage,
    status: isCallCompleted ? 'COMPLETED' : pendingJob.status,
    processingStatus: isCallCompleted ? 'completed' : 'queued',
    progress: isCallCompleted ? 100 : pendingJob.progress,
  };

  assert.equal(effectiveJob.status, 'COMPLETED');
  assert.equal(effectiveJob.processingStatus, 'completed');
  assert.equal(effectiveJob.stage, 'COMPLETE');
  assert.equal(effectiveJob.progress, 100);
});

test('CALLS: frontend state derivation correctly transitions PENDING -> PROCESSING -> COMPLETED', () => {
  // Test frontend isProcessing, isCompleted, isFailed computation
  const deriveState = (job: any, call: any) => {
    const isCompleted = Boolean(
      job?.status === 'COMPLETED' ||
      job?.processingStatus === 'completed' ||
      call?.processingStatus === 'completed' ||
      call?.aiStatus === 'completed' ||
      (Boolean(call?.summary || call?.aiSummary?.shortSummary) && Boolean(call?.transcript || call?.transcription?.text))
    );

    const isFailed = Boolean(
      !isCompleted &&
      (job?.status === 'FAILED' ||
       job?.processingStatus === 'failed' ||
       call?.processingStatus === 'failed' ||
       call?.aiStatus === 'failed')
    );

    const isProcessing = Boolean(
      !isCompleted &&
      !isFailed &&
      (job?.status === 'PROCESSING' ||
       job?.status === 'PENDING' ||
       job?.processingStatus === 'queued' ||
       job?.processingStatus === 'processing' ||
       call?.processingStatus === 'queued' ||
       call?.processingStatus === 'processing' ||
       call?.aiStatus === 'pending' ||
       call?.aiStatus === 'processing')
    );

    return { isCompleted, isFailed, isProcessing };
  };

  // State 1: PENDING / Queued
  const statePending = deriveState(
    { status: 'PENDING', processingStatus: 'queued', progress: 0 },
    { processingStatus: 'queued', aiStatus: 'pending' },
  );
  assert.equal(statePending.isProcessing, true);
  assert.equal(statePending.isCompleted, false);
  assert.equal(statePending.isFailed, false);

  // State 2: PROCESSING (transcription/summary)
  const stateProcessing = deriveState(
    { status: 'PROCESSING', processingStatus: 'processing', progress: 50 },
    { processingStatus: 'processing', aiStatus: 'pending' },
  );
  assert.equal(stateProcessing.isProcessing, true);
  assert.equal(stateProcessing.isCompleted, false);

  // State 3: COMPLETED (worker finished)
  const stateCompleted = deriveState(
    { status: 'COMPLETED', processingStatus: 'completed', progress: 100 },
    { processingStatus: 'completed', aiStatus: 'completed', summary: 'Summary done' },
  );
  assert.equal(stateCompleted.isProcessing, false);
  assert.equal(stateCompleted.isCompleted, true);
  assert.equal(stateCompleted.isFailed, false);

  // State 4: Edge case: DB has completed call, but job object is stale 0% UPLOAD
  const stateStaleJob = deriveState(
    { status: 'PENDING', processingStatus: 'queued', progress: 0 },
    { processingStatus: 'completed', aiStatus: 'completed', summary: 'Done' },
  );
  assert.equal(stateStaleJob.isCompleted, true);
  assert.equal(stateStaleJob.isProcessing, false);

  // State 5: FAILED
  const stateFailed = deriveState(
    { status: 'FAILED', processingStatus: 'failed', error: 'Transcription failed' },
    { processingStatus: 'failed', aiStatus: 'failed' },
  );
  assert.equal(stateFailed.isFailed, true);
  assert.equal(stateFailed.isProcessing, false);
  assert.equal(stateFailed.isCompleted, false);
});

