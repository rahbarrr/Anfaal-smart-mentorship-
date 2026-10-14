import assert from 'node:assert/strict';
import test from 'node:test';

import { maskDeletedCallParts } from './callVisibility.js';

test('call visibility masks deleted recording, summary, and intelligence fields without mutating the source', () => {
  const source = {
    recordingUrl: 'private-recording',
    recording: { storageKey: 'calls/private-recording' },
    summary: 'private summary',
    summaryVersions: [{ content: 'old summary' }],
    aiSummary: { shortSummary: 'private AI summary' },
    topicsDiscussed: ['study'],
    actionItems: ['revise'],
    recordingDeletedAt: new Date(),
    summaryDeletedAt: new Date(),
    intelligenceDeletedAt: new Date(),
  };

  const visible = maskDeletedCallParts(source);

  assert.equal(visible.recordingUrl, undefined);
  assert.equal(visible.recording, undefined);
  assert.equal(visible.summary, undefined);
  assert.equal(visible.summaryVersions, undefined);
  assert.equal(visible.aiSummary, undefined);
  assert.equal(visible.topicsDiscussed, undefined);
  assert.equal(visible.actionItems, undefined);
  assert.equal(source.recordingUrl, 'private-recording');
  assert.equal(source.summary, 'private summary');
});

test('call visibility preserves fields that were not moved to Bin', () => {
  const visible = maskDeletedCallParts({ summary: 'visible summary', recordingUrl: 'visible-recording', duration: 30 });

  assert.equal(visible.summary, 'visible summary');
  assert.equal(visible.recordingUrl, 'visible-recording');
  assert.equal(visible.duration, 30);
});
