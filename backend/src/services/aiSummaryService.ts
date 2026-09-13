import { readFileSync } from 'node:fs';

export interface AiSummaryInput {
  transcript: string;
  mentorNotes?: string;
}

export interface AiSummaryResult {
  shortSummary: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
}

export interface AiSummaryService {
  summarize(input: AiSummaryInput): Promise<AiSummaryResult>;
}

export class MockAiSummaryService implements AiSummaryService {
  async summarize({ transcript, mentorNotes }: AiSummaryInput): Promise<AiSummaryResult> {
    const notes = mentorNotes?.trim();

    return {
      shortSummary:
        notes && notes.length > 0
          ? `The student made consistent progress in reading and learning routines, with additional focus on presentation confidence and weekly goal tracking.`
          : `The student discussed academic progress, confidence-building, and a clearer study routine.`,
      keyDiscussionPoints: [
        'Reviewed recent academic progress and subject-specific challenges.',
        'Confirmed a consistent study schedule and revision habit.',
        'Discussed confidence during class participation and presentations.',
      ],
      studentConcerns: [
        'Low confidence while presenting in class',
        'Difficulty maintaining consistent revision across all subjects',
      ],
      actionItems: [
        'Complete weekly reading goals before the next session',
        'Practice one 3-minute presentation each week',
        'Share questions with the mentor before the next call',
      ],
      followUpRecommendations: [
        'Track reading completion using a simple weekly checklist',
        'Schedule a follow-up on presentation confidence in 7 days',
      ],
      topicsDiscussed: [
        'Academic progress',
        'Study habits',
        'Presentation confidence',
        'Goal setting',
      ],
    };
  }
}

export class RealAiSummaryService implements AiSummaryService {
  async summarize({ transcript, mentorNotes }: AiSummaryInput): Promise<AiSummaryResult> {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new MockAiSummaryService().summarize({ transcript, mentorNotes });
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
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an educational mentorship assistant. Extract a concise summary and structured fields for a mentorship session strictly in valid JSON with keys: shortSummary, keyDiscussionPoints, studentConcerns, actionItems, followUpRecommendations, topicsDiscussed.',
            },
            {
              role: 'user',
              content: `Transcript:\n${transcript}\n\nMentor notes:\n${mentorNotes ?? 'No mentor notes provided.'}`,
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

      const parsed = JSON.parse(cleanedContent) as Partial<AiSummaryResult>;

      return {
        shortSummary: parsed.shortSummary ?? 'The session focused on academic progress, confidence, and actionable next steps.',
        keyDiscussionPoints: Array.isArray(parsed.keyDiscussionPoints) ? parsed.keyDiscussionPoints : [],
        studentConcerns: Array.isArray(parsed.studentConcerns) ? parsed.studentConcerns : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        followUpRecommendations: Array.isArray(parsed.followUpRecommendations) ? parsed.followUpRecommendations : [],
        topicsDiscussed: Array.isArray(parsed.topicsDiscussed) ? parsed.topicsDiscussed : [],
      };
    } catch {
      return new MockAiSummaryService().summarize({ transcript, mentorNotes });
    }
  }
}

export function createAiSummaryService(): AiSummaryService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return hasKey ? new RealAiSummaryService() : new MockAiSummaryService();
}
