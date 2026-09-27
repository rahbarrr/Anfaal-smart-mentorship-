export interface CallMetadata {
  mentorName?: string;
  menteeName?: string;
  date?: string;
  duration?: number;
}

export interface AiSummaryInput {
  transcript: string;
  mentorNotes?: string;
  metadata?: CallMetadata;
}

export interface AiSummaryResult {
  shortSummary: string;
  keyDiscussionPoints: string[];
  academicProgress: string;
  personalDevelopment: string;
  challenges: string[];
  achievements: string[];
  actionItems: string[];
  mentorCommitments: string[];
  menteeCommitments: string[];
  followUpTopics: string[];
  topicsDiscussed: string[];
  // Backward-compat fields
  studentConcerns: string[];
  followUpRecommendations: string[];
}

export interface AiSummaryService {
  summarize(input: AiSummaryInput): Promise<AiSummaryResult>;
}

export class MockAiSummaryService implements AiSummaryService {
  async summarize({ transcript, mentorNotes, metadata }: AiSummaryInput): Promise<AiSummaryResult> {
    const hasMentorNotes = Boolean(mentorNotes?.trim());
    const menteeName = metadata?.menteeName || 'the mentee';

    return {
      shortSummary: hasMentorNotes
        ? `The mentorship session with ${menteeName} covered academic progress in mathematics, Quran reading consistency, and study habit improvement. The mentee reported difficulty with quadratic equations and agreed to a daily practice plan. Career exploration topics were flagged for the next session.`
        : `The mentorship session focused on academic progress, Quran reading routine, and study consistency. Key challenges in mathematics were discussed and an action plan was agreed upon.`,
      keyDiscussionPoints: [
        'Mathematics preparation — specifically quadratic equations and word problems',
        'Weekly study routine and time management strategies',
        'Quran and Islamic reading consistency (Surah Al-Kahf, daily Fajr reading)',
        'Career interests in computer science and engineering',
      ],
      academicProgress:
        'The mentee completed most weekly study goals. Difficulty was reported with quadratic equations and word problems in mathematics. Quran recitation maintained at 2 pages after Fajr daily.',
      personalDevelopment:
        'The mentee demonstrated commitment by tracking their progress and identifying specific weak areas proactively. A goal-oriented approach to addressing mathematics gaps was agreed upon.',
      challenges: [
        'Difficulty with quadratic equations and mathematical word problems',
        'Time management while balancing multiple subjects',
      ],
      achievements: [
        'Completed most weekly study goals',
        'Maintained daily Quran recitation routine after Fajr throughout the week',
        'Recited Surah Al-Kahf on Friday as per Islamic practice',
      ],
      actionItems: [
        `${menteeName} will practice 5 quadratic equations each evening using the step-by-step formula sheet`,
        `${menteeName} will mark stuck questions during practice to review in the next session`,
        `${menteeName} will research career options in computer science before the next session`,
      ],
      mentorCommitments: [
        'Review marked mathematics questions during the next session',
        'Spend 15 minutes on career exploration topics in the next call',
        'Send a formula reference sheet for quadratic equations',
      ],
      menteeCommitments: [
        'Practice 5 quadratic equations every evening',
        'Mark all stuck problems for mentor review',
        'Continue daily Quran recitation routine',
      ],
      followUpTopics: [
        'Review of quadratic equation practice problems',
        'Career planning — computer science and engineering exploration',
        'Study consistency and time management check-in',
      ],
      topicsDiscussed: [
        'Mathematics preparation',
        'Quadratic equations',
        'Quran reading routine',
        'Islamic practice',
        'Study habits',
        'Career interests',
        'Time management',
      ],
      // Backward-compat fields
      studentConcerns: [
        'Difficulty with quadratic equations and word problems in mathematics',
        'Managing time effectively across multiple subjects',
      ],
      followUpRecommendations: [
        'Monitor mathematics practice progress using a checklist',
        'Begin career exploration discussion in next session',
        'Continue reviewing Quran recitation consistency',
      ],
    };
  }
}

export class RealAiSummaryService implements AiSummaryService {
  async summarize({ transcript, mentorNotes, metadata }: AiSummaryInput): Promise<AiSummaryResult> {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new MockAiSummaryService().summarize({ transcript, mentorNotes, metadata });
    }

    const systemPrompt = `You are an expert educational mentorship documentation assistant for the Anfaal Foundation.

Your task is to analyze a mentorship call transcript and produce a structured JSON summary.

CRITICAL RULES — you MUST follow these strictly:
1. ONLY summarize what was EXPLICITLY discussed in the transcript. Do NOT invent, infer, or assume.
2. Do NOT make any diagnostic claims about mental health, family situations, motivation, personality, or medical conditions.
3. If something was NOT discussed, leave that field empty (empty string or empty array).
4. Clearly distinguish factual statements from interpretations.
5. Use "The mentee said..." or "According to the transcript..." when summarizing, not "The mentee feels..." or "The mentee appears to...".
6. All text should be factual, professional, and grounded strictly in what was said.

You MUST return a single valid JSON object with EXACTLY these keys:
{
  "shortSummary": "2-3 sentence factual summary of what was discussed",
  "keyDiscussionPoints": ["array of main topics actually discussed"],
  "academicProgress": "what the mentee reported about their academic work (quote or paraphrase from transcript)",
  "personalDevelopment": "any personal growth, habits, or character topics discussed (leave empty string if none)",
  "challenges": ["specific difficulties the mentee explicitly mentioned"],
  "achievements": ["specific accomplishments the mentee explicitly mentioned"],
  "actionItems": ["concrete tasks agreed upon for the mentee"],
  "mentorCommitments": ["tasks the mentor committed to"],
  "menteeCommitments": ["tasks the mentee committed to"],
  "followUpTopics": ["topics explicitly flagged for next session"],
  "topicsDiscussed": ["short labels of every topic mentioned"],
  "studentConcerns": ["concerns the mentee explicitly raised"],
  "followUpRecommendations": ["follow-up suggestions mentioned in the call"]
}`;

    const userPrompt = `Transcript:\n${transcript}

Mentor Notes:\n${mentorNotes || 'No mentor notes provided.'}

Session metadata:
- Mentor: ${metadata?.mentorName || 'Not specified'}
- Mentee: ${metadata?.menteeName || 'Not specified'}
- Date: ${metadata?.date || 'Not specified'}
- Duration: ${metadata?.duration ? `${metadata.duration} minutes` : 'Not specified'}

Please produce the structured JSON summary strictly from the transcript above.`;

    try {
      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI provider responded with ${response.status}`);
      }

      const payload = await response.json();
      const rawContent = payload.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('AI provider returned no content');
      }

      let cleanedContent = rawContent.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanedContent) as Partial<AiSummaryResult>;

      return {
        shortSummary: parsed.shortSummary ?? '',
        keyDiscussionPoints: Array.isArray(parsed.keyDiscussionPoints) ? parsed.keyDiscussionPoints : [],
        academicProgress: parsed.academicProgress ?? '',
        personalDevelopment: parsed.personalDevelopment ?? '',
        challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        mentorCommitments: Array.isArray(parsed.mentorCommitments) ? parsed.mentorCommitments : [],
        menteeCommitments: Array.isArray(parsed.menteeCommitments) ? parsed.menteeCommitments : [],
        followUpTopics: Array.isArray(parsed.followUpTopics) ? parsed.followUpTopics : [],
        topicsDiscussed: Array.isArray(parsed.topicsDiscussed) ? parsed.topicsDiscussed : [],
        studentConcerns: Array.isArray(parsed.studentConcerns) ? parsed.studentConcerns : [],
        followUpRecommendations: Array.isArray(parsed.followUpRecommendations) ? parsed.followUpRecommendations : [],
      };
    } catch (err) {
      console.error('[AISummary] Error calling AI API, falling back to mock:', err instanceof Error ? err.message : err);
      return new MockAiSummaryService().summarize({ transcript, mentorNotes, metadata });
    }
  }
}

export function createAiSummaryService(): AiSummaryService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return hasKey ? new RealAiSummaryService() : new MockAiSummaryService();
}
