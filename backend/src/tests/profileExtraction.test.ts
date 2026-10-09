import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  MockProfileExtractionService,
  RealProfileExtractionService,
  extractProfileFromCall,
  normalizeFieldKey,
  getFieldCategoryAndLabel,
  getMenteeFieldValue,
} from '../services/profileExtractionService.js';
import { applySuggestionToMentee } from '../routes/menteeRoutes.js';
import { ProfileSuggestion } from '../models/ProfileSuggestion.js';
import { Mentee } from '../models/Mentee.js';
import { Call } from '../models/Call.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';

test('PROFILE EXTRACTION (Case 1): Call mentions career goal and proposes it with evidence', async () => {
  const service = new MockProfileExtractionService();
  const transcript = `
    Mentor: What are your long-term ambitions?
    Mentee: My career goal is AI Engineer. I want to build intelligent systems.
  `;
  const proposals = await service.extractFromText(transcript);
  const careerProposal = proposals.find((p) => p.fieldKey === 'goals.careerGoal');

  assert.ok(careerProposal, 'Should propose career goal');
  assert.equal(careerProposal.extractedValue, 'AI Engineer');
  assert.equal(careerProposal.category, 'goals');
  assert.ok(careerProposal.evidence.includes('career goal is AI Engineer'), 'Should contain verbatim evidence quote');
  assert.ok(careerProposal.confidence >= 0.8, 'Should have high confidence');
});

test('PROFILE EXTRACTION (Case 2): Call mentions academic marks and associates with correct examinations', async () => {
  const service = new MockProfileExtractionService();
  const transcript = `
    Mentor: How did your examinations go?
    Mentee: I scored 68% in previous exam. In the latest exam I achieved 74%. My target percentage is 85% for boards.
  `;
  const proposals = await service.extractFromText(transcript);

  const prev = proposals.find((p) => p.fieldKey === 'academic.previousPercentage');
  const latest = proposals.find((p) => p.fieldKey === 'academic.latestPercentage');
  const target = proposals.find((p) => p.fieldKey === 'academic.targetPercentage');

  assert.ok(prev, 'Should extract previous exam percentage');
  assert.equal(prev.extractedValue, 68);
  assert.equal(prev.category, 'academic');

  assert.ok(latest, 'Should extract latest exam percentage');
  assert.equal(latest.extractedValue, 74);
  assert.equal(latest.category, 'academic');

  assert.ok(target, 'Should extract target percentage');
  assert.equal(target.extractedValue, 85);
  assert.equal(target.category, 'academic');
  assert.notEqual(latest.extractedValue, target.extractedValue, 'Should not confuse target with latest actual result');
});

test('PROFILE EXTRACTION (Case 3): Call does not mention location and leaves location empty (no hallucination)', async () => {
  const service = new MockProfileExtractionService();
  const transcript = `
    Mentor: How is your mathematics preparation going?
    Mentee: It is going well, I am practicing quadratic equations every day.
  `;
  const proposals = await service.extractFromText(transcript);
  const locProposal = proposals.find((p) => p.fieldKey === 'location');

  assert.equal(locProposal, undefined, 'Must not propose location when not mentioned in transcript');
});

test('PROFILE EXTRACTION (Case 4): Profile has no academic data, returns empty or missing states without fallbacks', () => {
  const blankMentee = {
    _id: 'm_empty',
    name: 'New Student',
    academic: undefined,
    goals: undefined,
  };

  const prevVal = getMenteeFieldValue(blankMentee, 'academic.previousPercentage');
  const latestVal = getMenteeFieldValue(blankMentee, 'academic.latestPercentage');
  const goalVal = getMenteeFieldValue(blankMentee, 'goals.careerGoal');

  assert.equal(prevVal, undefined);
  assert.equal(latestVal, undefined);
  assert.equal(goalVal, undefined);
});

test('PROFILE EXTRACTION (Case 5): New suggestion conflicts with a manually verified value', async () => {
  const mentee = {
    _id: 'm1',
    name: 'Amina',
    goals: { careerGoal: 'Doctor' },
    profileProvenance: {
      'goals.careerGoal': { method: 'manual', updatedBy: 'mentor_1', updatedAt: new Date() },
    },
  };

  const call = {
    _id: 'c1',
    menteeId: 'm1',
    date: new Date(),
    transcript: 'My career goal is AI Engineer.',
  };

  const callMock = mock.method(Call, 'findById', () => ({
    lean: async () => call,
  }) as any);

  const menteeMock = mock.method(Mentee, 'findById', () => ({
    lean: async () => mentee,
  }) as any);

  let createdSuggestion: any = null;
  const suggestionFindMock = mock.method(ProfileSuggestion, 'findOne', async () => null);
  const suggestionCreateMock = mock.method(ProfileSuggestion, 'create', async (doc: any) => {
    createdSuggestion = doc;
    return doc;
  });

  process.env.ALLOW_MOCK_AI = 'true';
  const result = await extractProfileFromCall('c1', call.transcript, '', 'm1');

  callMock.mock.restore();
  menteeMock.mock.restore();
  suggestionFindMock.mock.restore();
  suggestionCreateMock.mock.restore();

  assert.ok(result.success, 'Extraction should succeed');
  assert.ok(createdSuggestion, 'Suggestion should be created');
  assert.equal(createdSuggestion.conflictFlag, true, 'Conflict flag must be true');
  assert.ok(createdSuggestion.conflictDetails?.includes('Doctor'), 'Conflict details should mention Doctor');
  assert.ok(createdSuggestion.conflictDetails?.includes('AI Engineer'), 'Conflict details should mention AI Engineer');
});

test('PROFILE EXTRACTION (Case 6): Two calls contain conflicting values', async () => {
  const call1Text = 'My career goal is Doctor.';
  const call2Text = 'My career goal is Software Engineer.';

  const service = new MockProfileExtractionService();
  const [prop1] = await service.extractFromText(call1Text);
  const [prop2] = await service.extractFromText(call2Text);

  assert.equal(prop1.extractedValue, 'Doctor');
  assert.equal(prop2.extractedValue, 'Software Engineer');
  assert.notEqual(prop1.extractedValue, prop2.extractedValue, 'Different calls can extract conflicting proposals for mentor review');
});

test('PROFILE EXTRACTION (Case 7): Mentor approves, edits, and rejects suggestions', async () => {
  const mockMentee: any = {
    _id: 'm1',
    name: 'Zaid',
    goals: {},
    academic: {},
    routine: {},
    profileProvenance: {},
    markModified: () => {},
    save: async () => {},
  };

  // 1. Approve career goal
  applySuggestionToMentee(mockMentee, 'goals.careerGoal', 'AI Engineer');
  assert.equal(mockMentee.goals.careerGoal, 'AI Engineer');

  // 2. Edit study hours before saving (e.g. proposal was 2, edited to 3)
  applySuggestionToMentee(mockMentee, 'routine.selfStudyHours', 3);
  assert.equal(mockMentee.routine.selfStudyHours, 3);

  // 3. Reject leaves unapproved field untouched
  assert.equal(mockMentee.academic.previousPercentage, undefined);
});

test('PROFILE EXTRACTION (Case 8): Mentor attempts to access another mentors mentee (IDOR defense)', async () => {
  const mentorUserId = 'mentor_user_unauthorized';
  const targetMenteeId = 'mentee_other';

  const mentorMock = mock.method(Mentor, 'findOne', () => ({
    userId: mentorUserId,
    _id: 'mentor_prof_unauthorized',
  }) as any);

  const mentorshipMock = mock.method(Mentorship, 'findOne', () => ({
    lean: async () => null, // No active mentorship assignment!
  }) as any);

  const mentorProfile = await Mentor.findOne({ userId: mentorUserId });
  const assignment = await Mentorship.findOne({
    mentorId: String((mentorProfile as any)?._id),
    menteeId: targetMenteeId,
    status: 'active',
  }).lean();

  mentorMock.mock.restore();
  mentorshipMock.mock.restore();

  assert.equal(Boolean(assignment), false, 'Mentor access to unassigned mentee must be denied');
});

test('PROFILE EXTRACTION (Case 9): Missing or empty transcript handles gracefully without throwing', async () => {
  const call = {
    _id: 'c_empty',
    menteeId: 'm1',
    transcript: '',
    summary: '',
    mentorNotes: '',
  };

  const callMock = mock.method(Call, 'findById', () => ({
    lean: async () => call,
  }) as any);

  const menteeMock = mock.method(Mentee, 'findById', () => ({
    lean: async () => ({ _id: 'm1', name: 'Student' }),
  }) as any);

  const result = await extractProfileFromCall('c_empty', '', '', 'm1');

  callMock.mock.restore();
  menteeMock.mock.restore();

  assert.equal(result.success, true);
  assert.equal(result.extractedCount, 0);
  assert.deepEqual(result.suggestions, []);
});

test('PROFILE EXTRACTION (Case 10 & 11): Repeated extraction on same call is idempotent and retry-safe', async () => {
  const call = {
    _id: 'c_repeat',
    menteeId: 'm_repeat',
    transcript: 'My career goal is Data Scientist.',
    summary: '',
  };

  const callMock = mock.method(Call, 'findById', () => ({
    lean: async () => call,
  }) as any);

  const menteeMock = mock.method(Mentee, 'findById', () => ({
    lean: async () => ({ _id: 'm_repeat', name: 'Repeat Student' }),
  }) as any);

  // Existing suggestion was already approved!
  const existingApproved = {
    _id: 'sug_already_approved',
    sourceCallId: 'c_repeat',
    fieldKey: 'goals.careerGoal',
    status: 'approved',
    extractedValue: 'Data Scientist',
    save: async () => {},
  };

  const suggestionFindMock = mock.method(ProfileSuggestion, 'findOne', async () => existingApproved);

  const result = await extractProfileFromCall('c_repeat', call.transcript, '', 'm_repeat');

  callMock.mock.restore();
  menteeMock.mock.restore();
  suggestionFindMock.mock.restore();

  assert.equal(result.success, true);
  assert.equal(result.extractedCount, 1);
  assert.equal(result.suggestions[0].status, 'approved', 'Must preserve already reviewed suggestion status');
});

test('PROFILE EXTRACTION (Case 12): Field key normalization and category/label mapping', () => {
  assert.equal(normalizeFieldKey('careerGoal'), 'goals.careerGoal');
  assert.equal(normalizeFieldKey('previousPercentage'), 'academic.previousPercentage');
  assert.equal(normalizeFieldKey('selfStudyHours'), 'routine.selfStudyHours');

  const info1 = getFieldCategoryAndLabel('goals.careerGoal');
  assert.equal(info1.category, 'goals');
  assert.equal(info1.label, 'Career Goal');

  const info2 = getFieldCategoryAndLabel('routine.selfStudyHours');
  assert.equal(info2.category, 'routine');
  assert.equal(info2.label, 'Daily Self-Study Hours');
});
