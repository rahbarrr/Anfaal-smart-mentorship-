import 'server-only';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments: TranscriptSegment[];
  provider: string;
}

export const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024; // 25 MB OpenAI Whisper limit

export class MockTranscriptionService {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const mockSegments: TranscriptSegment[] = [
      {
        start: 2,
        end: 8,
        speaker: 'Mentor',
        text: 'Assalamu Alaikum Arif. How was your week, and how are your study preparations going?',
      },
      {
        start: 9,
        end: 22,
        speaker: 'Mentee',
        text: 'Wa Alaikum Assalam sir. It was productive overall. I completed my biology and physics assignments, but I had some difficulty with quadratic equations in mathematics.',
      },
      {
        start: 23,
        end: 38,
        speaker: 'Mentor',
        text: 'I understand. Quadratic equations require systematic practice. Have you been breaking down the factorization steps or using the formula directly?',
      },
      {
        start: 39,
        end: 55,
        speaker: 'Mentee',
        text: 'I was trying factorization mostly, but with negative coefficients I get confused. Also, I maintained my daily Quran recitation of 2 pages after Fajr.',
      },
      {
        start: 56,
        end: 72,
        speaker: 'Mentor',
        text: 'MashAllah, excellent consistency with Quran. For math, let us commit to practicing 5 problems daily using the step-by-step formula method. I will also share a reference cheat-sheet.',
      },
      {
        start: 73,
        end: 88,
        speaker: 'Mentee',
        text: 'That would be very helpful sir! I will solve 5 problems every evening and star any questions I cannot solve for our next call.',
      },
      {
        start: 89,
        end: 102,
        speaker: 'Mentor',
        text: 'BarakAllah feek Arif. Keep up the dedication and remember to balance study with adequate rest. See you next week inshaAllah.',
      },
      {
        start: 103,
        end: 110,
        speaker: 'Mentee',
        text: 'JazakAllah Khair sir! Assalamu Alaikum.',
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
    };
  }
}

export class RealTranscriptionService {
  async transcribe({ buffer, originalname, mimetype }: TranscriptionInput): Promise<TranscriptionResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;
    const allowMock = !isProduction && process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

    if (!buffer || buffer.length === 0) {
      throw new Error('Audio recording buffer is empty.');
    }

    if (buffer.length > MAX_TRANSCRIPTION_FILE_BYTES) {
      throw new Error(
        'Recording file size exceeds 25 MB. Please compress or split the audio before transcription.',
      );
    }

    if (!apiKey) {
      if (allowMock) {
        console.warn('[Transcription] No OpenAI API key configured. Using mock transcription because ALLOW_MOCK_TRANSCRIPTION=true.');
        return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
      }
      throw new Error('OpenAI API key is missing. Please set OPENAI_API_KEY in your environment.');
    }

    const safeMimeType = mimetype?.trim().toLowerCase() || 'audio/mpeg';
    const safeFileName = originalname || 'recording.mp3';

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: safeMimeType });
    formData.append('file', blob, safeFileName);
    formData.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1');
    formData.append('response_format', 'verbose_json');

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI Whisper API responded with ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ start: number; end: number; text: string }>;
    };

    const rawText = data.text?.trim() || '';
    if (!rawText) {
      throw new Error('Whisper API returned empty transcript text.');
    }

    let segments: TranscriptSegment[] = [];
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      segments = data.segments.map((seg, idx) => ({
        start: Math.round(seg.start),
        end: Math.round(seg.end),
        text: seg.text.trim(),
        speaker: idx % 2 === 0 ? 'Mentor' : 'Mentee',
      }));
    } else {
      // Fallback: split into sentences and timestamp
      const sentences = rawText.split(/(?<=[.!?])\s+/).filter(Boolean);
      let curr = 0;
      segments = sentences.map((sent, idx) => {
        const segDuration = Math.max(3, Math.round(sent.length / 15));
        const seg: TranscriptSegment = {
          start: curr,
          end: curr + segDuration,
          text: sent.trim(),
          speaker: idx % 2 === 0 ? 'Mentor' : 'Mentee',
        };
        curr += segDuration + 1;
        return seg;
      });
    }

    return {
      text: rawText,
      language: data.language || 'en',
      duration: data.duration ? Math.round(data.duration) : segments[segments.length - 1]?.end || 0,
      segments,
      provider: 'openai-whisper',
    };
  }
}

export function createTranscriptionService() {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey && !isProduction) {
    return new MockTranscriptionService();
  }
  return new RealTranscriptionService();
}
