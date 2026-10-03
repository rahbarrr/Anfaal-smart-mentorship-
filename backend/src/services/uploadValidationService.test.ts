import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAllowedRecordingExtension,
  isAllowedRecording,
  isStorageKeyOwnedByCall,
  isValidRecordingSize,
  sanitizeUploadFileName,
} from './uploadValidationService.js';

test('UPLOAD SECURITY: valid extensions are accepted with generic browser MIME types', () => {
  assert.equal(isAllowedRecording('session.MPEG', 'application/octet-stream'), true);
  assert.equal(hasAllowedRecordingExtension('call.mpga'), true);
  assert.equal(isAllowedRecording('notes.txt', 'text/plain'), false);
});

test('UPLOAD SECURITY: storage keys must belong to the exact call', () => {
  assert.equal(isStorageKeyOwnedByCall('calls/2026/10/call_abc123/file.mp3', 'abc123'), true);
  assert.equal(isStorageKeyOwnedByCall('calls/2026/10/call_other/file.mp3', 'abc123'), false);
  assert.equal(isStorageKeyOwnedByCall('calls/2026/10/call_abc123/../private.mp3', 'abc123'), false);
});

test('UPLOAD SECURITY: filenames and sizes are bounded', () => {
  assert.equal(sanitizeUploadFileName('../my call.mp3'), 'my_call.mp3');
  assert.equal(isValidRecordingSize(1024), true);
  assert.equal(isValidRecordingSize(200 * 1024 * 1024 + 1), false);
  assert.equal(isValidRecordingSize(1.5), false);
});
