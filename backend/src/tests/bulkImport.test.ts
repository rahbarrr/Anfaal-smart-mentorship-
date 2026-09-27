import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, sanitizeCsvFormula, generateCsvString } from '../services/csvParserService.js';

test('BULK IMPORT: parses valid CSV rows and headers correctly', () => {
  const csv = `name,email,standard
Aisha Khan,aisha@example.com,Class 8
Bilal Ahmed,bilal@example.com,Class 9`;

  const { headers, rows, parseErrors } = parseCsv(csv);
  assert.equal(parseErrors.length, 0);
  assert.deepEqual(headers, ['name', 'email', 'standard']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].data.name, 'Aisha Khan');
  assert.equal(rows[0].data.email, 'aisha@example.com');
  assert.equal(rows[1].data.name, 'Bilal Ahmed');
});

test('BULK IMPORT: handles quoted cells with commas and newlines', () => {
  const csv = `name,notes
"Khan, Aisha","Likes math,
needs help with algebra"`;

  const { rows, parseErrors } = parseCsv(csv);
  assert.equal(parseErrors.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.name, 'Khan, Aisha');
  assert.ok(rows[0].data.notes.includes('needs help with algebra'));
});

test('BULK IMPORT: prevents formula injection by escaping dangerous leading characters', () => {
  assert.equal(sanitizeCsvFormula('=CMD|"/C calc"!A0'), '\'=CMD|"/C calc"!A0');
  assert.equal(sanitizeCsvFormula('+12345'), '\'+12345');
  assert.equal(sanitizeCsvFormula('-SUM(A1:B1)'), '\'-SUM(A1:B1)');
  assert.equal(sanitizeCsvFormula('@SUM(A1:B1)'), '\'@SUM(A1:B1)');
  assert.equal(sanitizeCsvFormula('Regular Name'), 'Regular Name');
});

test('BULK IMPORT: generates compliant CSV output string', () => {
  const headers = ['name', 'role'];
  const data = [
    { name: 'Dr. Mentor', role: 'MENTOR' },
    { name: 'Student, A', role: 'MENTEE' },
  ];

  const csvString = generateCsvString(headers, data);
  assert.ok(csvString.includes('name,role'));
  assert.ok(csvString.includes('Dr. Mentor,MENTOR'));
  assert.ok(csvString.includes('"Student, A",MENTEE'));
});
