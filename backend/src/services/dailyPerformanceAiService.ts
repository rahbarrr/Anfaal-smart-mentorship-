export interface DailyRecordSummaryInput {
  menteeName: string;
  records: Array<{
    date: string;
    studyMinutes: number;
    quran: { ruku: number; ayat: number; pages: number };
    readingMinutes: number;
    dayRating: number;
    dailyReflection?: string;
    facedDifficulty?: boolean;
    difficultyNote?: string;
    needsMentorHelp?: boolean;
    mentorHelpNote?: string;
  }>;
}

export interface DailyPerformanceAiResult {
  weeklySummary: string;
  discussionPoints: string[];
}

export interface DailyPerformanceAiService {
  generateInsights(input: DailyRecordSummaryInput): Promise<DailyPerformanceAiResult>;
}

export class MockDailyPerformanceAiService implements DailyPerformanceAiService {
  async generateInsights({ menteeName, records }: DailyRecordSummaryInput): Promise<DailyPerformanceAiResult> {
    const daysSubmitted = records.length;
    const totalStudyMin = records.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const totalQuranRuku = records.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const totalQuranAyat = records.reduce((acc, r) => acc + (r.quran?.ayat || 0), 0);
    const totalQuranPages = records.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const totalReadingMin = records.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const avgRating = daysSubmitted > 0
      ? (records.reduce((acc, r) => acc + (r.dayRating || 0), 0) / daysSubmitted).toFixed(1)
      : '0.0';

    const studyHours = (totalStudyMin / 60).toFixed(1);
    const avgDailyStudy = daysSubmitted > 0 ? (totalStudyMin / daysSubmitted / 60).toFixed(1) : '0';
    const avgDailyReading = daysSubmitted > 0 ? Math.round(totalReadingMin / daysSubmitted) : 0;
    const goodDays = records.filter((r) => r.dayRating >= 4).length;

    const summaryParts: string[] = [];
    summaryParts.push(
      `${menteeName} recorded progress on ${daysSubmitted} ${daysSubmitted === 1 ? 'day' : 'days'} this week, completing a total of ${studyHours} hours of study (averaging ${avgDailyStudy}h per recorded day).`
    );

    if (totalQuranRuku > 0 || totalQuranAyat > 0 || totalQuranPages > 0) {
      summaryParts.push(
        `Quran recitation was recorded with ${totalQuranRuku} Ruku, ${totalQuranAyat} Ayat, and ${totalQuranPages} Pages logged.`
      );
    }

    if (totalReadingMin > 0) {
      summaryParts.push(
        `General reading totaled ${totalReadingMin} minutes (averaging ${avgDailyReading} min/day).`
      );
    }

    summaryParts.push(
      `Overall day experience was positive on ${goodDays} of ${daysSubmitted} recorded days (average day rating: ${avgRating}/5).`
    );

    const discussionPoints: string[] = [
      `Acknowledge and encourage their consistency in logging ${daysSubmitted} days this week.`,
      `Discuss routines that supported their ${studyHours} hours of study and explore sustainable pacing.`,
    ];

    const helpRequests = records.filter((r) => r.needsMentorHelp && r.mentorHelpNote);
    if (helpRequests.length > 0) {
      discussionPoints.push(
        `Review the mentee's note requesting assistance: "${helpRequests[0].mentorHelpNote}".`
      );
    } else {
      discussionPoints.push('Ask if they experienced any subject difficulties or need guidance for upcoming topics.');
    }

    const difficulties = records.filter((r) => r.facedDifficulty && r.difficultyNote);
    if (difficulties.length > 0) {
      discussionPoints.push(
        `Offer encouragement regarding the challenge mentioned: "${difficulties[0].difficultyNote}".`
      );
    } else {
      discussionPoints.push('Discuss their reading habits and celebrate their accomplishments from their reflections.');
    }

    return {
      weeklySummary: summaryParts.join(' '),
      discussionPoints,
    };
  }
}

export class RealDailyPerformanceAiService implements DailyPerformanceAiService {
  async generateInsights(input: DailyRecordSummaryInput): Promise<DailyPerformanceAiResult> {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new MockDailyPerformanceAiService().generateInsights(input);
    }

    try {
      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are an educational mentorship advisor for the Anfaal Foundation.
Analyze structured daily learning data and generate a supportive weekly summary and suggested discussion points for their mentor.
IMPORTANT RULES:
1. Provide descriptive statistics only. Do NOT make psychological, behavioral, or medical diagnoses or judgments.
2. Never label a student as lazy, depressed, unmotivated, or behind. Keep all language positive, encouraging, and supportive.
3. Output strictly valid JSON with keys: "weeklySummary" (string) and "discussionPoints" (array of 3-4 strings).`,
            },
            {
              role: 'user',
              content: `Mentee: ${input.menteeName}
Records (last 7 days):
${JSON.stringify(input.records, null, 2)}`,
            },
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

      const parsed = JSON.parse(cleanedContent) as Partial<DailyPerformanceAiResult>;

      return {
        weeklySummary: parsed.weeklySummary ?? 'The mentee demonstrated steady engagement throughout the week.',
        discussionPoints: Array.isArray(parsed.discussionPoints) && parsed.discussionPoints.length > 0
          ? parsed.discussionPoints
          : [
              'Celebrate their commitment and study hours recorded this week.',
              'Discuss their study habits and goals for next week.',
              'Ask if they need any mentorship support with current topics.',
            ],
      };
    } catch {
      return new MockDailyPerformanceAiService().generateInsights(input);
    }
  }
}

export function createDailyPerformanceAiService(): DailyPerformanceAiService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return hasKey ? new RealDailyPerformanceAiService() : new MockDailyPerformanceAiService();
}
