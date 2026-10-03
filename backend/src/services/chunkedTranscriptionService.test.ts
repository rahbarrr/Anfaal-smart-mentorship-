import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeChunkResults } from './chunkedTranscriptionService.js';

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
