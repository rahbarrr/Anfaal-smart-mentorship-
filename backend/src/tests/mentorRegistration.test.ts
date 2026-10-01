import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMentorRegistration } from '../routes/mentorRoutes.js';

test('MENTOR REGISTRATION: normalizes profile data and marks registration as pending review', () => {
  const result = normalizeMentorRegistration({
    fullName: '  Aisha Khan  ',
    email: 'AISHA@EXAMPLE.COM',
    password: 'StrongPass123',
    phone: '+91 98765 43210',
    gender: 'female',
    bio: 'I mentor students in Quran and academics.',
    expertise: 'Quran, Math, Study habits',
    availability: 'Weeknights',
    location: 'Karachi',
    preferredSubjects: ['Quran', 'Math'],
  });

  assert.equal(result.name, 'Aisha Khan');
  assert.equal(result.email, 'aisha@example.com');
  assert.equal(result.phone, '+919876543210');
  assert.equal(result.bio, 'I mentor students in Quran and academics.');
  assert.equal(result.status, 'disabled');
  assert.equal(result.password, 'StrongPass123');
  assert.deepEqual(result.preferredSubjects, ['Quran', 'Math']);
});

test('MENTOR REGISTRATION: rejects incomplete registration payloads', () => {
  assert.throws(() => {
    normalizeMentorRegistration({
      fullName: '',
      email: 'not-an-email',
      phone: '',
      password: 'short',
    });
  });
});
