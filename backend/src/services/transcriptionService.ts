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

// The OpenAI Transcriptions API accepts source files up to 25 MiB. Keep this
// guard close to the provider call so direct uploads cannot bypass the UI.
export const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;

export class NonRetryableTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableTranscriptionError';
  }
}

export function isNonRetryableTranscriptionError(error: unknown): boolean {
  return error instanceof NonRetryableTranscriptionError
    || (error instanceof Error && /recordings? larger than 25 MB|unsupported audio MIME type|unsupported audio format/i.test(error.message));
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

const SUPPORTED_AUDIO_MIME_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const SUPPORTED_WHISPER_EXTENSIONS = new Set(Object.values(SUPPORTED_AUDIO_MIME_TYPES));
SUPPORTED_WHISPER_EXTENSIONS.add('mpeg');
SUPPORTED_WHISPER_EXTENSIONS.add('mpga');
const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  oga: 'audio/ogg',
};

function normalizeMimeType(mimeType?: string): string {
  return (mimeType || 'audio/mpeg').trim().toLowerCase();
}

function resolveMimeType(originalname: string, mimeType?: string): string {
  const safeMimeType = normalizeMimeType(mimeType);
  if (SUPPORTED_AUDIO_MIME_TYPES[safeMimeType]) {
    return safeMimeType;
  }

  const extensionFromName = String(originalname || '').split('.').pop()?.toLowerCase();
  if (extensionFromName && EXTENSION_TO_MIME_TYPE[extensionFromName]) {
    return EXTENSION_TO_MIME_TYPE[extensionFromName];
  }

  return 'audio/mpeg';
}

function getSupportedAudioExtension(originalname: string, mimeType?: string): string {
  const safeMimeType = normalizeMimeType(mimeType);
  const extensionFromName = String(originalname || '').split('.').pop()?.toLowerCase();

  if (extensionFromName && SUPPORTED_WHISPER_EXTENSIONS.has(extensionFromName)) {
    return extensionFromName;
  }

  const extensionFromMime = SUPPORTED_AUDIO_MIME_TYPES[safeMimeType];
  if (extensionFromMime) {
    return extensionFromMime;
  }

  throw new Error(`Unsupported audio MIME type or extension for Whisper: ${safeMimeType} (${originalname || 'unknown-file'}). Supported formats: ${Array.from(SUPPORTED_WHISPER_EXTENSIONS).join(', ')}`);
}

function buildWhisperFileName(originalname: string, mimeType?: string): string {
  const extension = getSupportedAudioExtension(originalname, mimeType);
  const baseName = String(originalname || 'recording').split(/[\\/]/).pop() || 'recording';
  const cleanBaseName = baseName.replace(/\.[^/.]+$/, '') || 'recording';
  const sanitizedBaseName = cleanBaseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'recording';
  return `${sanitizedBaseName}.${extension}`;
}

export class RealTranscriptionService implements TranscriptionService {
  async transcribe({ buffer, originalname, mimetype }: TranscriptInput): Promise<TranscriptionResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;
    const allowMock = !isProduction && process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

    if (!buffer || buffer.length === 0) {
      throw new Error('Audio recording buffer is empty.');
    }

    if (buffer.length > MAX_TRANSCRIPTION_FILE_BYTES) {
      throw new NonRetryableTranscriptionError(
        'This recording is larger than 25 MB and cannot be transcribed. Compress or split it into files smaller than 25 MB, then upload again.',
      );
    }

    if (!apiKey) {
      if (allowMock) {
        console.warn('[Transcription] No API key found. Falling back to mock transcription because ALLOW_MOCK_TRANSCRIPTION=true');
        return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
      }
      throw new Error('Transcription API key is not configured. Real transcription required in production (OPENAI_API_KEY).');
    }

    try {
      const normalizedMimeType = resolveMimeType(originalname, mimetype);
      const safeFileName = buildWhisperFileName(originalname, normalizedMimeType);
      console.info(`[Transcription] Sending ${buffer.length} bytes to OpenAI: ${safeFileName} (${normalizedMimeType})`);

      const body = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: normalizedMimeType });
      body.append('file', blob, safeFileName);
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
  const isProduction = process.env.NODE_ENV === 'production';
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.TRANSCRIPTION_API_KEY);
  const allowMock = !isProduction && process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

  if (!hasKey && allowMock) {
    return new MockTranscriptionService();
  }

  return new RealTranscriptionService();
}
