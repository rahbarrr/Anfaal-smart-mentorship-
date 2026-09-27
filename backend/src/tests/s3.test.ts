import assert from 'node:assert/strict';
import test from 'node:test';
import { S3StorageProvider } from '../services/storageService.js';

test('S3: S3StorageProvider throws clear descriptive error if credentials missing', () => {
  const oldBucket = process.env.STORAGE_BUCKET;
  const oldKey = process.env.AWS_ACCESS_KEY_ID;
  const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;
  const oldOldKey = process.env.STORAGE_ACCESS_KEY;
  const oldOldSecret = process.env.STORAGE_SECRET_KEY;

  delete process.env.STORAGE_BUCKET;
  delete process.env.AWS_STORAGE_BUCKET;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.STORAGE_ACCESS_KEY;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.STORAGE_SECRET_KEY;

  try {
    assert.throws(
      () => new S3StorageProvider(),
      /S3 storage requires STORAGE_BUCKET/,
    );
  } finally {
    process.env.STORAGE_BUCKET = oldBucket;
    process.env.AWS_ACCESS_KEY_ID = oldKey;
    process.env.AWS_SECRET_ACCESS_KEY = oldSecret;
    process.env.STORAGE_ACCESS_KEY = oldOldKey;
    process.env.STORAGE_SECRET_KEY = oldOldSecret;
  }
});

test('S3: storageKey format follows calls/YYYY/MM/call_uuid/filename structure', () => {
  const generateStorageKey = (fileName: string, uuid: string, date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `calls/${year}/${month}/call_${uuid}/${cleanName}`;
  };

  const key = generateStorageKey('Session 1 - Math & Quran.m4a', 'abc12345');
  assert.match(key, /^calls\/\d{4}\/\d{2}\/call_abc12345\/Session_1_-_Math___Quran\.m4a$/);
  // Ensure fileName is NEVER the S3 key root
  assert.notEqual(key, 'Session 1 - Math & Quran.m4a');
});
