import 'server-only';

export interface AiSummaryInput {
  transcript: string;
  mentorNotes?: string;
  metadata?: {
    mentorName?: string;
    menteeName?: string;
    date?: string;
    duration?: number;
  };
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
  studentConcerns: string[];
  followUpRecommendations: string[];
}

export class MockAiSummaryService {
  async summarize({ mentorNotes, metadata }: AiSummaryInput): Promise<AiSummaryResult> {
    const menteeName = metadata?.menteeName || 'the student';
    const hasNotes = Boolean(mentorNotes?.trim());

    return {
      shortSummary: hasNotes
        ? `The mentorship session with ${menteeName} evaluated weekly academic progress, Quran recitation consistency, and time management. The mentee identified quadratic equations as a key challenge and committed to solving 5 practice questions daily.`
        : `The mentorship call reviewed academic preparation, study habits, and Quran reading consistency. A concrete action plan for mathematics was established.`,
      keyDiscussionPoints: [
        'Mathematics syllabus review — focus on quadratic equations and word problems',
        'Daily routine and self-study time management strategies',
        'Quran reading regularity (daily Fajr recitation and Surah Al-Kahf on Fridays)',
        'STEM career interests and science exam milestones',
      ],
      academicProgress:
        'The student completed weekly assignments across physics and biology. Difficulty was noted in mathematics quadratic equations. Quran reading was maintained consistently.',
      personalDevelopment:
        'The student demonstrated proactive self-reflection, openly addressing weak subject areas and agreeing to structured daily practice.',
      challenges: [
        'Quadratic equations with negative coefficients',
        'Balancing exam prep with school homework deadlines',
      ],
      achievements: [
        'Maintained daily Quran recitation habit after Fajr',
        'Completed all weekly biology and physics assignments ahead of time',
      ],
      actionItems: [
        `${menteeName} will solve 5 quadratic equation problems every evening using the formula method`,
        `${menteeName} will mark all stuck questions to review during the next mentorship session`,
      ],
      mentorCommitments: [
        'Share a formula sheet and step-by-step worked examples for quadratic equations',
        'Dedicate 15 minutes in the next session to review marked questions',
      ],
      menteeCommitments: [
        'Practice 5 mathematics questions daily',
        'Maintain daily Quran recitation routine after Fajr',
      ],
      followUpTopics: [
        'Review quadratic equation practice problems',
        'Quarterly exam preparation timeline',
        'Study routine consistency check-in',
      ],
      topicsDiscussed: [
        'Mathematics',
        'Quadratic Equations',
        'Quran Recitation',
        'Islamic Practice',
        'Study Habits',
        'Time Management',
      ],
      studentConcerns: [
        'Struggling with quadratic equation word problems',
        'Managing study time effectively',
      ],
      followUpRecommendations: [
        'Monitor daily math practice progress',
        'Follow up on Quran recitation consistency',
      ],
    };
  }
}

export class RealAiSummaryService {
  async summarize({ transcript, mentorNotes, metadata }: AiSummaryInput): Promise<AiSummaryResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    const allowMock = !isProduction && process.env.ALLOW_MOCK_AI === 'true';

    if (!apiKey) {
      if (allowMock) {
        console.warn('[AiSummary] No OpenAI API key configured. Using mock summary because ALLOW_MOCK_AI=true.');
        return new MockAiSummaryService().summarize({ transcript, mentorNotes, metadata });
      }
      throw new Error('OpenAI API key is missing. Please set OPENAI_API_KEY in your environment.');
    }

    const systemPrompt = `You are an expert educational mentorship documentation assistant for the Anfaal Foundation.
Analyze the provided mentorship call transcript, mentor notes, and metadata to generate an insightful, structured educational summary.
You must respond with valid JSON containing the following fields:
- shortSummary: concise 2-4 sentence narrative summary
- keyDiscussionPoints: array of strings (top 3-5 discussion topics)
- academicProgress: narrative on subject progress and exam preparations
- personalDevelopment: narrative on mindset, study discipline, and habits
- challenges: array of strings (student difficulties or struggles)
- achievements: array of strings (accomplishments, milestones)
- actionItems: array of strings (concrete tasks for upcoming week)
- mentorCommitments: array of strings (promises or tasks mentor agreed to)
- menteeCommitments: array of strings (promises or tasks mentee agreed to)
- followUpTopics: array of strings (items to check in next session)
- topicsDiscussed: array of strings (broad keywords/tags)
- studentConcerns: array of strings (student worries or hurdles)
- followUpRecommendations: array of strings (actionable advice for future calls)`;

    const userPrompt = `
Metadata:
- Mentor: ${metadata?.mentorName || 'Mentor'}
- Mentee: ${metadata?.menteeName || 'Mentee'}
- Date: ${metadata?.date || 'Recent'}
- Duration: ${metadata?.duration ? `${metadata.duration} minutes` : 'Standard'}

Mentor Notes:
${mentorNotes || 'None provided'}

Transcript:
${transcript ? transcript.slice(0, 15000) : 'No transcript available.'}
`;

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI API responded with ${response.status}: ${errText}`);
    }

    const payload = await response.json();
    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI returned empty message content.');
    }

    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned) as Partial<AiSummaryResult>;

    return {
      shortSummary: parsed.shortSummary || '',
      keyDiscussionPoints: Array.isArray(parsed.keyDiscussionPoints) ? parsed.keyDiscussionPoints : [],
      academicProgress: parsed.academicProgress || '',
      personalDevelopment: parsed.personalDevelopment || '',
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
  }
}

export function createAiSummaryService() {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey && !isProduction) {
    return new MockAiSummaryService();
  }
  return new RealAiSummaryService();
}
