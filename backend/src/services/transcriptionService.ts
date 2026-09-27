export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptInput {
  buffer?: Buffer;
  originalname: string;
  mimetype: string;
  audioUrl?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptSegment[];
  provider?: string;
  confidenceWarning?: boolean;
}

export interface TranscriptionService {
  transcribe(input: TranscriptInput): Promise<TranscriptionResult>;
}

export class MockTranscriptionService implements TranscriptionService {
  async transcribe(input: TranscriptInput): Promise<TranscriptionResult> {
    const mockSegments: TranscriptSegment[] = [
      {
        start: 2,
        end: 7,
        speaker: 'Mentor',
        text: 'Assalamu Alaikum Arif. How was your week, and how are your study preparations going?',
      },
      {
        start: 8,
        end: 18,
        speaker: 'Mentee',
        text: 'Wa Alaikum Assalam sir. It was good overall. I completed most of my weekly goals, but I had some difficulty managing my mathematics preparation.',
      },
      {
        start: 19,
        end: 29,
        speaker: 'Mentor',
        text: 'I see. Which specific topic in mathematics gave you trouble? Was it trigonometry or algebra?',
      },
      {
        start: 30,
        end: 42,
        speaker: 'Mentee',
        text: 'It was quadratic equations and word problems. I was spending too much time on each problem and getting stuck on the formulas.',
      },
      {
        start: 43,
        end: 55,
        speaker: 'Mentor',
        text: 'That is quite normal at this stage. How about your Quran and Islamic reading routine? Were you able to maintain daily consistency?',
      },
      {
        start: 56,
        end: 67,
        speaker: 'Mentee',
        text: 'Alhamdulillah, yes. I recited Surah Al-Kahf on Friday and read 2 pages after Fajr prayer every day this week.',
      },
      {
        start: 68,
        end: 80,
        speaker: 'Mentor',
        text: 'MashaAllah, that is wonderful consistency. Now regarding math, let us agree on an action plan. Can you practice 5 quadratic problems every evening using the step-by-step formula sheet?',
      },
      {
        start: 81,
        end: 92,
        speaker: 'Mentee',
        text: 'Yes sir, I will do that and mark the questions where I get stuck so we can review them in our next session.',
      },
      {
        start: 93,
        end: 104,
        speaker: 'Mentor',
        text: 'Excellent. Also, think about the career options we discussed earlier in computer science and engineering. We will spend 15 minutes on that next week. Keep up the great work!',
      },
      {
        start: 105,
        end: 110,
        speaker: 'Mentee',
        text: 'JazakAllah Khair sir. See you next week!',
      },
    ];

    const formattedLines = mockSegments.map((s) => {
      const minutes = Math.floor(s.start / 60);
      const seconds = Math.floor(s.start % 60);
      const timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
      return `${timeStr} ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`;
    });

    return {
      text: formattedLines.join('\n\n'),
      language: 'en',
      duration: 110,
      segments: mockSegments,
      provider: 'mock-whisper-diarization',
      confidenceWarning: false,
    };
  }
}

export class RealTranscriptionService implements TranscriptionService {
  async transcribe({ buffer, originalname, mimetype }: TranscriptInput): Promise<TranscriptionResult> {
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;
    const allowMock = process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

    if (!buffer) {
      throw new Error('No audio recording buffer available for transcription.');
    }

    if (!apiKey) {
      if (allowMock) {
        console.warn('[Transcription] No API key found. Falling back to mock transcription because ALLOW_MOCK_TRANSCRIPTION=true');
        return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
      }
      throw new Error('Transcription API key is not configured. Real transcription required in production.');
    }

    try {
      const body = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'audio/mpeg' });
      body.append('file', blob, originalname);
      body.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1');
      body.append('response_format', 'verbose_json');

      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Whisper API responded with ${response.status}: ${errBody}`);
      }

      const payload = (await response.json()) as {
        text?: string;
        language?: string;
        duration?: number;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      const rawText = payload.text?.trim() || '';
      if (!rawText) {
        throw new Error('No transcript text returned from Whisper');
      }

      // Convert Whisper segments with speaker alternation (Speaker 1 / Speaker 2 or Mentor / Mentee)
      let segments: TranscriptSegment[] = [];
      if (Array.isArray(payload.segments) && payload.segments.length > 0) {
        segments = payload.segments.map((seg, idx) => {
          const speaker = idx % 2 === 0 ? 'Mentor' : 'Mentee';
          return {
            start: Math.round(seg.start),
            end: Math.round(seg.end),
            text: seg.text.trim(),
            speaker,
          };
        });
      } else {
        // Fallback: split by sentences and assign timestamps
        const sentences = rawText.split(/(?<=[.!?])\s+/).filter(Boolean);
        let currTime = 0;
        segments = sentences.map((sent, idx) => {
          const segDuration = Math.max(3, Math.round(sent.length / 15));
          const seg = {
            start: currTime,
            end: currTime + segDuration,
            text: sent,
            speaker: idx % 2 === 0 ? 'Mentor' : 'Mentee',
          };
          currTime += segDuration;
          return seg;
        });
      }

      // Build structured formatted text with timestamps
      const formattedLines = segments.map((s) => {
        const minutes = Math.floor(s.start / 60);
        const seconds = Math.floor(s.start % 60);
        const timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
        return `${timeStr} ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`;
      });

      return {
        text: formattedLines.join('\n\n'),
        language: payload.language || 'en',
        duration: payload.duration || segments[segments.length - 1]?.end || 0,
        segments,
        provider: 'openai-whisper-verbose',
        confidenceWarning: rawText.length < 50,
      };
    } catch (err) {
      if (allowMock) {
        console.warn('[Transcription] Whisper error, falling back to mock because ALLOW_MOCK_TRANSCRIPTION=true:', err instanceof Error ? err.message : err);
        return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
      }
      throw new Error(`Transcription failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function createTranscriptionService(): TranscriptionService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.TRANSCRIPTION_API_KEY);
  const allowMock = process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

  if (!hasKey && allowMock) {
    return new MockTranscriptionService();
  }

  return new RealTranscriptionService();
}
