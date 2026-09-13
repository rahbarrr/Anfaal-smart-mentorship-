import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeAssignments } from './mentorshipService.js';

test('summarizeAssignments groups active mentorships by mentor', () => {
  const result = summarizeAssignments([
    { mentorName: 'Rahul Sharma', menteeName: 'Aisha Khan', status: 'active' },
    { mentorName: 'Rahul Sharma', menteeName: 'Nadia Hussain', status: 'active' },
    { mentorName: 'Priya Nair', menteeName: 'Sara Ali', status: 'archived' },
  ]);

  assert.equal(result.totalAssignments, 3);
  assert.equal(result.activeAssignments, 2);
  assert.equal(result.byMentor[0].mentorName, 'Rahul Sharma');
  assert.equal(result.byMentor[0].menteeCount, 2);
  assert.equal(result.byMentor[1].mentorName, 'Priya Nair');
  assert.equal(result.byMentor[1].menteeCount, 1);
});
