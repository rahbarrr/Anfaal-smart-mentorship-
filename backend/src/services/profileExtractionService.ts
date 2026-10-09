import { ProfileSuggestion, ProfileSuggestionCategory, ProfileSuggestionDocument } from '../models/ProfileSuggestion.js';
import { Mentee } from '../models/Mentee.js';
import { Call } from '../models/Call.js';

export interface ExtractedFieldProposal {
  fieldKey: string;
  category: ProfileSuggestionCategory;
  label: string;
  extractedValue: any;
  evidence: string;
  sourceType: 'transcript' | 'summary';
  confidence: number;
}

export interface ProfileExtractionResult {
  success: boolean;
  extractedCount: number;
  suggestions: ProfileSuggestionDocument[];
  error?: string;
}

export interface ProfileExtractionService {
  extractFromText(
    transcript: string,
    summaryText?: string,
    mentorNotes?: string,
  ): Promise<ExtractedFieldProposal[]>;
}

/**
 * Normalizes field keys to consistent canonical dot notation.
 */
export function normalizeFieldKey(key: string): string {
  const mapping: Record<string, string> = {
    careerGoal: 'goals.careerGoal',
    'goals.careerGoal': 'goals.careerGoal',
    semesterGoal: 'goals.semesterGoal',
    'goals.semesterGoal': 'goals.semesterGoal',
    previousPercentage: 'academic.previousPercentage',
    'academic.previousPercentage': 'academic.previousPercentage',
    latestPercentage: 'academic.latestPercentage',
    'academic.latestPercentage': 'academic.latestPercentage',
    targetPercentage: 'academic.targetPercentage',
    'academic.targetPercentage': 'academic.targetPercentage',
    currentExam: 'academic.currentExam',
    'academic.currentExam': 'academic.currentExam',
    favouriteSubjects: 'academic.favouriteSubjects',
    'academic.favouriteSubjects': 'academic.favouriteSubjects',
    weakSubjects: 'academic.weakSubjects',
    'academic.weakSubjects': 'academic.weakSubjects',
    selfStudyHours: 'routine.selfStudyHours',
    'routine.selfStudyHours': 'routine.selfStudyHours',
    schedule: 'routine.schedule',
    'routine.schedule': 'routine.schedule',
    habits: 'routine.habits',
    'routine.habits': 'routine.habits',
    skills: 'careerInterests.skills',
    'careerInterests.skills': 'careerInterests.skills',
    skillsToDevelop: 'careerInterests.skillsToDevelop',
    'careerInterests.skillsToDevelop': 'careerInterests.skillsToDevelop',
    secondaryInterests: 'careerInterests.secondaryInterests',
    'careerInterests.secondaryInterests': 'careerInterests.secondaryInterests',
    hobbies: 'careerInterests.hobbies',
    'careerInterests.hobbies': 'careerInterests.hobbies',
    location: 'location',
    challenges: 'challenges',
  };
  return mapping[key] || key;
}

export function getFieldCategoryAndLabel(fieldKey: string): { category: ProfileSuggestionCategory; label: string } {
  const norm = normalizeFieldKey(fieldKey);
  switch (norm) {
    case 'goals.careerGoal':
      return { category: 'goals', label: 'Career Goal' };
    case 'goals.semesterGoal':
      return { category: 'goals', label: 'Semester Goal' };
    case 'academic.previousPercentage':
      return { category: 'academic', label: 'Previous Exam Percentage' };
    case 'academic.latestPercentage':
      return { category: 'academic', label: 'Latest Exam Percentage' };
    case 'academic.targetPercentage':
      return { category: 'academic', label: 'Target Percentage' };
    case 'academic.currentExam':
      return { category: 'academic', label: 'Current Exam Preparation' };
    case 'academic.favouriteSubjects':
      return { category: 'academic', label: 'Favourite Subjects' };
    case 'academic.weakSubjects':
      return { category: 'academic', label: 'Subjects Needing Improvement' };
    case 'routine.selfStudyHours':
      return { category: 'routine', label: 'Daily Self-Study Hours' };
    case 'routine.schedule':
      return { category: 'routine', label: 'Study Schedule' };
    case 'routine.habits':
      return { category: 'routine', label: 'Daily Habits' };
    case 'careerInterests.skills':
      return { category: 'career', label: 'Skills' };
    case 'careerInterests.skillsToDevelop':
      return { category: 'career', label: 'Skills to Develop' };
    case 'careerInterests.secondaryInterests':
      return { category: 'career', label: 'Career Interests' };
    case 'careerInterests.hobbies':
      return { category: 'career', label: 'Hobbies' };
    case 'location':
      return { category: 'basic', label: 'Location' };
    case 'challenges':
      return { category: 'challenges', label: 'Challenge / Obstacle' };
    default:
      if (norm.startsWith('academic.')) return { category: 'academic', label: norm.split('.')[1] };
      if (norm.startsWith('goals.')) return { category: 'goals', label: norm.split('.')[1] };
      if (norm.startsWith('routine.')) return { category: 'routine', label: norm.split('.')[1] };
      if (norm.startsWith('careerInterests.')) return { category: 'career', label: norm.split('.')[1] };
      return { category: 'basic', label: norm };
  }
}

/**
 * Reads the current mentee profile value for a given normalized field key.
 */
export function getMenteeFieldValue(mentee: any, normalizedKey: string): any {
  if (!mentee) return undefined;
  const parts = normalizedKey.split('.');
  if (parts.length === 1) {
    return mentee[parts[0]];
  }
  if (parts.length === 2) {
    const parent = mentee[parts[0]];
    return parent ? parent[parts[1]] : undefined;
  }
  return undefined;
}

/**
 * Mock extractor for test environments or when ALLOW_MOCK_AI=true.
 * Deterministic keyword & regex extraction with strict rules:
 * Only extracts when explicitly stated in transcript/summary/notes.
 */
export class MockProfileExtractionService implements ProfileExtractionService {
  async extractFromText(
    transcript: string,
    summaryText = '',
    mentorNotes = '',
  ): Promise<ExtractedFieldProposal[]> {
    const combined = `${transcript}\n${summaryText}\n${mentorNotes}`;
    const proposals: ExtractedFieldProposal[] = [];

    // Helper to find supporting sentence
    const findSentence = (pattern: RegExp): string => {
      const sentences = combined.split(/(?<=[.!?\n])\s+/);
      const match = sentences.find((s) => pattern.test(s));
      return (match ? match.trim().slice(0, 180) : combined.slice(0, 120)).trim();
    };

    // 1. Career Goal
    const careerMatch = combined.match(/(?:career goal|aim|aspire to be|want to become|becoming an?|future goal)\s*(?:is|:)?\s*([A-Za-z\s]+?)(?=[.,\n]|$)/i);
    if (careerMatch && careerMatch[1]) {
      const val = careerMatch[1].trim();
      if (val && !/^(to|a|an|the)$/i.test(val)) {
        proposals.push({
          fieldKey: 'goals.careerGoal',
          category: 'goals',
          label: 'Career Goal',
          extractedValue: val,
          evidence: findSentence(/(?:career goal|aspire|want to become)/i),
          sourceType: transcript.includes(careerMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.94,
        });
      }
    }

    // 2. Previous Percentage (e.g., "scored 68% in previous exam", "previous percentage: 70%")
    const prevMatch = combined.match(/(?:previous|last)\s*(?:exam|term|semester)?\s*(?:percentage|marks|score)?\s*(?:was|is|:|I achieved)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i)
      || combined.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:in|on|for)?\s*(?:the\s*)?(?:previous|last)\s*(?:exam|term|semester)/i);
    if (prevMatch && prevMatch[1]) {
      const num = parseFloat(prevMatch[1]);
      if (num >= 0 && num <= 100) {
        proposals.push({
          fieldKey: 'academic.previousPercentage',
          category: 'academic',
          label: 'Previous Exam Percentage',
          extractedValue: num,
          evidence: findSentence(/(?:previous|last)\s*(?:exam|term|percentage)|\d+%\s*in\s*previous/i),
          sourceType: transcript.includes(prevMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.95,
        });
      }
    }

    // 3. Latest Percentage (e.g., "latest exam 74%", "scored 75% in recent exam", "in the latest exam I achieved 74%")
    const latestMatch = combined.match(/(?:latest|recent|current)\s*(?:exam|test)?\s*(?:percentage|marks|score)?\s*(?:was|is|:|I achieved)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i)
      || combined.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:in|on|for)?\s*(?:the\s*)?(?:latest|recent|current)\s*(?:exam|test)/i);
    if (latestMatch && latestMatch[1]) {
      const num = parseFloat(latestMatch[1]);
      if (num >= 0 && num <= 100) {
        proposals.push({
          fieldKey: 'academic.latestPercentage',
          category: 'academic',
          label: 'Latest Exam Percentage',
          extractedValue: num,
          evidence: findSentence(/(?:latest|recent)\s*(?:exam|percentage)|\d+%\s*in\s*latest/i),
          sourceType: transcript.includes(latestMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.95,
        });
      }
    }

    // 4. Target Percentage (e.g., "target percentage is 85%", "target: 90%")
    const targetMatch = combined.match(/target\s*(?:percentage|score|marks)?\s*(?:is|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    if (targetMatch && targetMatch[1]) {
      const num = parseFloat(targetMatch[1]);
      if (num >= 0 && num <= 100) {
        proposals.push({
          fieldKey: 'academic.targetPercentage',
          category: 'academic',
          label: 'Target Percentage',
          extractedValue: num,
          evidence: findSentence(/target\s*(?:percentage|score)/i),
          sourceType: transcript.includes(targetMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.92,
        });
      }
    }

    // 5. Self-Study Hours (e.g. "2 hours per day", "self-study: 3 hours", "studies 2 hours daily")
    const studyMatch = combined.match(/(?:self-?study|study(?:ing)?)\s*(?:for|is|:)?\s*(\d+(?:\.\d+)?)\s*hours?(?:\s*(?:per\s*day|daily))?/i)
      || combined.match(/(\d+(?:\.\d+)?)\s*hours?(?:\s*of)?\s*self-?study/i);
    if (studyMatch && studyMatch[1]) {
      const hours = parseFloat(studyMatch[1]);
      if (hours > 0 && hours <= 24) {
        proposals.push({
          fieldKey: 'routine.selfStudyHours',
          category: 'routine',
          label: 'Daily Self-Study Hours',
          extractedValue: hours,
          evidence: findSentence(/(?:self-?study|study.*hours)/i),
          sourceType: transcript.includes(studyMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.91,
        });
      }
    }

    // 6. Favourite Subjects
    const favMatch = combined.match(/(?:favourite|favorite)\s*subjects?\s*(?:is|are|:)?\s*([A-Za-z\s,]+?)(?=[.,\n]|$)/i);
    if (favMatch && favMatch[1]) {
      const subjects = favMatch[1]
        .split(/[,&]|\band\b/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && !/^(is|are|the)$/i.test(s));
      if (subjects.length > 0) {
        proposals.push({
          fieldKey: 'academic.favouriteSubjects',
          category: 'academic',
          label: 'Favourite Subjects',
          extractedValue: subjects,
          evidence: findSentence(/(?:favourite|favorite)\s*subject/i),
          sourceType: transcript.includes(favMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.88,
        });
      }
    }

    // 7. Weak Subjects / Difficulties
    const weakMatch = combined.match(/(?:difficulty|struggling|weak(?:ness)?|needs? improvement)\s*(?:with|in)\s*([A-Za-z\s]+?)(?=[.,\n]|$)/i);
    if (weakMatch && weakMatch[1]) {
      const subj = weakMatch[1].trim();
      if (subj && !/^(the|a|an)$/i.test(subj)) {
        proposals.push({
          fieldKey: 'academic.weakSubjects',
          category: 'academic',
          label: 'Subjects Needing Improvement',
          extractedValue: [subj],
          evidence: findSentence(/(?:difficulty|struggling|weak)/i),
          sourceType: transcript.includes(weakMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.89,
        });
      }
    }

    // 8. Location (ONLY if explicitly stated e.g. "I live in Govandi", "location: Govandi", "from Govandi")
    const locMatch = combined.match(/(?:lives? in|from|residing in|location:?)\s*([A-Z][a-zA-Z\s]+?)(?=[.,\n]|$)/);
    if (locMatch && locMatch[1]) {
      const loc = locMatch[1].trim();
      if (loc && loc.length > 2 && !/^(Class|Standard|Grade|School|College)$/i.test(loc)) {
        proposals.push({
          fieldKey: 'location',
          category: 'basic',
          label: 'Location',
          extractedValue: loc,
          evidence: findSentence(/(?:lives? in|from|residing in|location:?)/i),
          sourceType: transcript.includes(locMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.85,
        });
      }
    }

    // 9. Challenges
    const chalMatch = combined.match(/(?:challenge|obstacle|problem):?\s*([A-Za-z0-9\s,–-]+?)(?=[.\n]|$)/i);
    if (chalMatch && chalMatch[1]) {
      const chalTitle = chalMatch[1].trim();
      if (chalTitle && chalTitle.length > 3) {
        proposals.push({
          fieldKey: 'challenges',
          category: 'challenges',
          label: 'Challenge / Obstacle',
          extractedValue: {
            title: chalTitle,
            description: chalTitle,
            priority: 'Medium',
            mentorAction: '',
            status: 'Open',
            progress: 0,
          },
          evidence: findSentence(/(?:challenge|obstacle|problem)/i),
          sourceType: transcript.includes(chalMatch[0]) ? 'transcript' : 'summary',
          confidence: 0.87,
        });
      }
    }

    return proposals;
  }
}

/**
 * Production OpenAI extractor with JSON schema and strict anti-hallucination prompts.
 */
export class RealProfileExtractionService implements ProfileExtractionService {
  async extractFromText(
    transcript: string,
    summaryText = '',
    mentorNotes = '',
  ): Promise<ExtractedFieldProposal[]> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    const isProduction = process.env.NODE_ENV === 'production';
    const allowMock = !isProduction && process.env.ALLOW_MOCK_AI === 'true';

    if (!apiKey) {
      if (allowMock) {
        return new MockProfileExtractionService().extractFromText(transcript, summaryText, mentorNotes);
      }
      throw new Error('AI API key is missing for RealProfileExtractionService');
    }

    const systemPrompt = `You are an expert AI mentor profiling assistant for the Anfaal Smart Mentorship platform.
Your task is to extract FACTUAL mentee profile information strictly from the provided call transcript and summary.

CRITICAL RULES:
1. ONLY extract information that is EXPLICITLY stated or unambiguously supported by the transcript or summary.
2. NEVER invent, assume, extrapolate, or hallucinate mentee details. If a detail is missing, DO NOT include that field.
3. Distinguish between a target percentage and actual examination marks/percentage.
4. Distinguish between a student's planned routine and actual verified habit.
5. Distinguish between courses mentioned vs courses enrolled or assigned.
6. Do NOT infer sensitive personal details or psychological diagnoses.
7. Return a valid JSON array of extracted fields. Each item MUST have:
   - "fieldKey": e.g. "goals.careerGoal", "academic.previousPercentage", "academic.latestPercentage", "academic.targetPercentage", "academic.currentExam", "academic.favouriteSubjects", "academic.weakSubjects", "routine.selfStudyHours", "routine.schedule", "routine.habits", "careerInterests.skills", "careerInterests.skillsToDevelop", "careerInterests.secondaryInterests", "careerInterests.hobbies", "location", "challenges"
   - "category": one of "basic", "academic", "goals", "routine", "career", "challenges"
   - "label": human-readable label
   - "extractedValue": string, number, or array of strings
   - "evidence": exact verbatim quote/excerpt from the text supporting this fact (<= 160 characters)
   - "sourceType": "transcript" or "summary"
   - "confidence": number between 0.70 and 1.00
8. If nothing reliable was discussed, return an empty array: []`;

    const userPrompt = `Input Data:
TRANSCRIPT:
${transcript.slice(0, 8000)}

AI SUMMARY:
${summaryText.slice(0, 3000)}

MENTOR NOTES:
${mentorNotes.slice(0, 1000)}

Extract supported mentee profile fields in JSON format:`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI responded with status ${response.status}`);
      }

      const payload = await response.json();
      const rawContent = payload.choices?.[0]?.message?.content;
      if (!rawContent) {
        return [];
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return [];
      }

      // Handle array or object with fields/suggestions key
      const items: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.fields)
          ? parsed.fields
          : Array.isArray(parsed.suggestions)
            ? parsed.suggestions
            : [];

      const sanitized: ExtractedFieldProposal[] = [];
      for (const item of items) {
        if (!item || !item.fieldKey || item.extractedValue === undefined || item.extractedValue === null) {
          continue;
        }
        const normKey = normalizeFieldKey(String(item.fieldKey));
        const { category, label } = getFieldCategoryAndLabel(normKey);
        sanitized.push({
          fieldKey: normKey,
          category,
          label: item.label || label,
          extractedValue: item.extractedValue,
          evidence: String(item.evidence || '').trim().slice(0, 200),
          sourceType: item.sourceType === 'summary' ? 'summary' : 'transcript',
          confidence: Math.min(Math.max(Number(item.confidence) || 0.85, 0), 1),
        });
      }

      return sanitized;
    } catch (err) {
      if (allowMock) {
        console.warn('[ProfileExtraction] Falling back to MockProfileExtractionService:', err instanceof Error ? err.message : err);
        return new MockProfileExtractionService().extractFromText(transcript, summaryText, mentorNotes);
      }
      throw err;
    }
  }
}

export function createProfileExtractionService(): ProfileExtractionService {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  const allowMock = !isProduction && process.env.ALLOW_MOCK_AI === 'true';

  if (!hasKey && allowMock) {
    return new MockProfileExtractionService();
  }

  return new RealProfileExtractionService();
}

/**
 * Main coordinator function to extract profile suggestions from a call.
 * Idempotent: Does not overwrite already approved or rejected suggestions.
 * Non-crashing: Wraps errors gracefully.
 */
export async function extractProfileFromCall(
  callId: string,
  transcriptText?: string,
  summaryData?: any,
  explicitMenteeId?: string,
): Promise<ProfileExtractionResult> {
  try {
    const call = await Call.findById(callId).lean();
    if (!call) {
      return { success: false, extractedCount: 0, suggestions: [], error: 'Call not found' };
    }

    const menteeId = explicitMenteeId || call.menteeId;
    if (!menteeId) {
      return { success: false, extractedCount: 0, suggestions: [], error: 'Mentee ID not found on call' };
    }

    const mentee = await Mentee.findById(menteeId).lean();
    if (!mentee) {
      return { success: false, extractedCount: 0, suggestions: [], error: 'Mentee not found' };
    }

    const transcript = transcriptText || call.transcript || call.transcription?.text || '';
    const summaryText = typeof summaryData === 'string'
      ? summaryData
      : summaryData?.shortSummary || call.summary || call.aiSummary?.shortSummary || '';
    const mentorNotes = call.mentorNotes || '';

    // If both transcript and summary are empty, nothing can be extracted
    if (!transcript.trim() && !summaryText.trim() && !mentorNotes.trim()) {
      return { success: true, extractedCount: 0, suggestions: [] };
    }

    const service = createProfileExtractionService();
    const proposals = await service.extractFromText(transcript, summaryText, mentorNotes);

    if (proposals.length === 0) {
      return { success: true, extractedCount: 0, suggestions: [] };
    }

    const savedSuggestions: ProfileSuggestionDocument[] = [];

    for (const prop of proposals) {
      const normKey = normalizeFieldKey(prop.fieldKey);
      const currentValue = getMenteeFieldValue(mentee, normKey);

      // Check conflict between extracted value and current profile value
      let conflictFlag = false;
      let conflictDetails: string | undefined;

      if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        const currStr = typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue);
        const extrStr = typeof prop.extractedValue === 'object' ? JSON.stringify(prop.extractedValue) : String(prop.extractedValue);

        if (currStr.trim().toLowerCase() !== extrStr.trim().toLowerCase()) {
          conflictFlag = true;
          conflictDetails = `Current profile value (${currStr}) differs from extracted value (${extrStr})`;
        }
      }

      // Check idempotency: Find existing suggestion for this call & field
      const existing = await ProfileSuggestion.findOne({
        sourceCallId: callId,
        fieldKey: normKey,
      });

      if (existing) {
        // If already reviewed (approved/rejected/modified), DO NOT overwrite
        if (existing.status !== 'pending') {
          savedSuggestions.push(existing);
          continue;
        }

        // Update pending suggestion in place
        existing.extractedValue = prop.extractedValue;
        existing.currentValue = currentValue;
        existing.evidence = prop.evidence;
        existing.confidence = prop.confidence;
        existing.conflictFlag = conflictFlag;
        existing.conflictDetails = conflictDetails;
        existing.callDate = call.date ? new Date(call.date) : new Date();
        await existing.save();
        savedSuggestions.push(existing);
      } else {
        // Create new pending suggestion
        const created = await ProfileSuggestion.create({
          menteeId,
          sourceCallId: callId,
          callDate: call.date ? new Date(call.date) : new Date(),
          fieldKey: normKey,
          category: prop.category,
          label: prop.label,
          currentValue,
          extractedValue: prop.extractedValue,
          evidence: prop.evidence,
          sourceType: prop.sourceType,
          confidence: prop.confidence,
          status: 'pending',
          conflictFlag,
          conflictDetails,
        });
        savedSuggestions.push(created);
      }
    }

    console.info(`[ProfileExtraction] callId=${callId} menteeId=${menteeId} extracted=${savedSuggestions.length}`);
    return {
      success: true,
      extractedCount: savedSuggestions.length,
      suggestions: savedSuggestions,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ProfileExtractionError] callId=${callId} error=${errorMsg}`);
    return {
      success: false,
      extractedCount: 0,
      suggestions: [],
      error: errorMsg,
    };
  }
}
