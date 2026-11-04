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
  allowEmpty?: boolean;
  language?: string;
  prompt?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptSegment[];
  provider?: string;
  confidenceWarning?: boolean;
  timestampsUnavailable?: boolean;
  isMock?: boolean;
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

export class TranscriptionApiError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, options?: { status?: number; retryable?: boolean; cause?: unknown }) {
    super(message, options);
    this.name = 'TranscriptionApiError';
    this.status = options?.status;
    this.retryable = options?.retryable ?? (options?.status ? (options.status >= 500 || options.status === 429 || options.status === 408) : true);
  }
}

export function isNonRetryableTranscriptionError(error: unknown): boolean {
  if (error instanceof NonRetryableTranscriptionError) return true;
  if (error instanceof TranscriptionApiError && !error.retryable) return true;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as any).status;
    if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/Whisper API responded with (400|401|403|404)/i.test(message)) return true;
  if (/API key is not configured|API key is missing|unauthorized|forbidden/i.test(message)) return true;
  return /recordings? larger than 25 MB|unsupported audio MIME type|unsupported audio format|Audio recording buffer is empty/i.test(message);
}

export function isFatalAuthOrClientError(error: unknown): boolean {
  if (error instanceof TranscriptionApiError && (error.status === 401 || error.status === 403)) return true;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as any).status;
    if (status === 401 || status === 403) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /Whisper API responded with (401|403)|API key is not configured|API key is missing|unauthorized|forbidden/i.test(message);
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '[00:00]';
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds - minutes * 60;
  const wholeSecs = Math.floor(remainingSecs);
  const centiseconds = Math.round((remainingSecs - wholeSecs) * 100);
  if (centiseconds > 0) {
    return `[${String(minutes).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
  }
  return `[${String(minutes).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}]`;
}

export class MockTranscriptionService implements TranscriptionService {
  async transcribe(input: TranscriptInput): Promise<TranscriptionResult> {
    console.warn(
      '[Transcription] [MOCK_ACTIVE] MockTranscriptionService is generating demo transcript. This is for development testing only.',
    );

    // Realistic demo segments without alternating Mentor/Mentee labels.
    // Speaker is marked as 'Unknown' until real speaker diarization is available.
    const mockSegments: TranscriptSegment[] = [
      {
        start: 2.25,
        end: 7.5,
        speaker: 'Unknown',
        text: 'Assalamu Alaikum Arif. How was your week, and how are your study preparations going?',
      },
      {
        start: 8.1,
        end: 18.4,
        speaker: 'Unknown',
        text: 'Wa Alaikum Assalam sir. It was good overall. I completed most of my weekly goals, but I had some difficulty managing my mathematics preparation.',
      },
      {
        start: 19.0,
        end: 29.2,
        speaker: 'Unknown',
        text: 'I see. Which specific topic in mathematics gave you trouble? Was it trigonometry or algebra?',
      },
      {
        start: 30.0,
        end: 42.15,
        speaker: 'Unknown',
        text: 'It was quadratic equations and word problems. I was spending too much time on each problem and getting stuck on the formulas.',
      },
      {
        start: 43.0,
        end: 55.4,
        speaker: 'Unknown',
        text: 'That is quite normal at this stage. How about your Quran and Islamic reading routine? Were you able to maintain daily consistency?',
      },
      {
        start: 56.2,
        end: 67.0,
        speaker: 'Unknown',
        text: 'Alhamdulillah, yes. I recited Surah Al-Kahf on Friday and read 2 pages after Fajr prayer every day this week.',
      },
      {
        start: 68.3,
        end: 80.5,
        speaker: 'Unknown',
        text: 'MashaAllah, that is wonderful consistency. Now regarding math, let us agree on an action plan. Can you practice 5 quadratic problems every evening using the step-by-step formula sheet?',
      },
      {
        start: 81.1,
        end: 92.4,
        speaker: 'Unknown',
        text: 'Yes sir, I will do that and mark the questions where I get stuck so we can review them in our next session.',
      },
      {
        start: 93.0,
        end: 104.2,
        speaker: 'Unknown',
        text: 'Excellent. Also, think about the career options we discussed earlier in computer science and engineering. We will spend 15 minutes on that next week. Keep up the great work!',
      },
      {
        start: 105.0,
        end: 110.0,
        speaker: 'Unknown',
        text: 'JazakAllah Khair sir. See you next week!',
      },
    ];

    const formattedLines = mockSegments.map((s) => {
      const timeStr = formatTimestamp(s.start);
      return `${timeStr} ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`;
    });

    return {
      text: formattedLines.join('\n\n'),
      language: input.language || 'en',
      duration: 110,
      segments: mockSegments,
      provider: 'mock-transcription',
      confidenceWarning: true,
      timestampsUnavailable: false,
      isMock: true,
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
  async transcribe(input: TranscriptInput): Promise<TranscriptionResult> {
    const { buffer, originalname, mimetype, allowEmpty, language, prompt } = input;
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;
    const allowMock = !isProduction && process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

    if (!buffer || buffer.length === 0) {
      throw new NonRetryableTranscriptionError('Audio recording buffer is empty.');
    }

    if (buffer.length > MAX_TRANSCRIPTION_FILE_BYTES) {
      throw new NonRetryableTranscriptionError(
        'This recording is larger than 25 MB and cannot be transcribed. Compress or split it into files smaller than 25 MB, then upload again.',
      );
    }

    if (!apiKey) {
      if (allowMock) {
        console.warn(
          '[Transcription] [DEVELOPMENT MOCK] No OPENAI_API_KEY configured. Explicitly using MockTranscriptionService (ALLOW_MOCK_TRANSCRIPTION=true). Mock transcription will never be permitted in production.',
        );
        return new MockTranscriptionService().transcribe(input);
      }
      throw new NonRetryableTranscriptionError(
        isProduction
          ? 'Transcription API key is not configured. Real transcription required in production (OPENAI_API_KEY).'
          : 'Transcription API key is not configured. Configure OPENAI_API_KEY or set ALLOW_MOCK_TRANSCRIPTION=true for local development.',
      );
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

      // Preserve language and code-switching:
      // If a specific language is explicitly requested, pass it.
      // Otherwise do NOT force 'en' so Whisper can auto-detect Hindi, English, Urdu or multilingual audio.
      if (language) {
        body.append('language', language);
      }

      // Supply a guidance prompt to preserve Hindi, English, and Hinglish verbatim without translating.
      const defaultMultilingualPrompt =
        'Mentorship call conversation in English, Hindi, and Hinglish. Please transcribe faithfully in the original spoken language (including Romanized Hinglish or Devanagari Hindi as spoken). Do not translate into English.';
      const transcriptionPrompt = prompt || process.env.TRANSCRIPTION_PROMPT || defaultMultilingualPrompt;
      body.append('prompt', transcriptionPrompt);

      const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || process.env.TRANSCRIPTION_TIMEOUT_MS || 60000);
      const signal = AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000);

      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const sanitizedErr = errBody
          .slice(0, 500)
          .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
          .replace(/sk-[A-Za-z0-9_-]+/gi, 'sk-[REDACTED]');
        const isRetryable = response.status === 429 || response.status === 408 || response.status >= 500;
        console.error(`[Transcription] OpenAI API error: status=${response.status} file=${safeFileName} error=${sanitizedErr}`);
        throw new TranscriptionApiError(`Whisper API responded with ${response.status}: ${sanitizedErr}`, {
          status: response.status,
          retryable: isRetryable,
        });
      }

      const payload = (await response.json()) as {
        text?: string;
        language?: string;
        duration?: number;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid JSON response received from Whisper API');
      }

      const rawText = payload.text?.trim() || '';
      if (!rawText) {
        if (allowEmpty) {
          return {
            text: '',
            language: payload.language || 'en',
            duration: payload.duration || 0,
            segments: [],
            provider: 'openai-whisper-verbose',
            confidenceWarning: true,
            timestampsUnavailable: true,
            isMock: false,
          };
        }
        throw new NonRetryableTranscriptionError('No transcript text returned from Whisper');
      }

      let segments: TranscriptSegment[] = [];
      let timestampsUnavailable = false;
      let formattedText = rawText;

      if (Array.isArray(payload.segments) && payload.segments.length > 0) {
        // Preserve actual float timestamps returned by the API without rounding to whole seconds.
        // Never assign automatic alternating Mentor/Mentee labels. Use 'Unknown' until reliable diarization is available.
        segments = payload.segments.map((seg) => {
          const rawStart = typeof seg.start === 'number' && Number.isFinite(seg.start) ? seg.start : 0;
          const rawEnd = typeof seg.end === 'number' && Number.isFinite(seg.end) ? seg.end : rawStart;
          return {
            start: Number(rawStart.toFixed(2)),
            end: Number(rawEnd.toFixed(2)),
            text: seg.text.trim(),
            speaker: 'Unknown',
          };
        });

        const formattedLines = segments.map((s) => {
          const timeStr = formatTimestamp(s.start);
          return `${timeStr} Unknown: ${s.text}`;
        });
        formattedText = formattedLines.join('\n\n');
      } else {
        // Do NOT generate misleading timestamps by estimating sentence duration when the API does not return segments.
        // Preserve the full transcript text directly and mark unavailable timestamps appropriately.
        segments = [];
        timestampsUnavailable = true;
        formattedText = rawText;
      }

      return {
        text: formattedText,
        language: payload.language || 'en',
        duration: payload.duration ?? (segments[segments.length - 1]?.end ?? 0),
        segments,
        provider: 'openai-whisper-verbose',
        confidenceWarning: rawText.length < 50 || timestampsUnavailable,
        timestampsUnavailable,
        isMock: false,
      };
    } catch (err) {
      // NEVER silently fall back to mock transcription when real transcription fails!
      // A failed transcription job must report meaningful errors instead of presenting demo text.
      if (err instanceof NonRetryableTranscriptionError || err instanceof TranscriptionApiError) {
        throw err;
      }
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout/i.test(err.message));
      if (isTimeout) {
        console.error(`[Transcription] OpenAI request timed out: ${err instanceof Error ? err.message : String(err)}`);
        throw new TranscriptionApiError(`Whisper API request timed out: ${err instanceof Error ? err.message : String(err)}`, {
          retryable: true,
        });
      }
      throw new Error(`Transcription failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function createTranscriptionService(): TranscriptionService {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.TRANSCRIPTION_API_KEY);
  const requestedMock = process.env.ALLOW_MOCK_TRANSCRIPTION === 'true';

  if (requestedMock && isProduction) {
    throw new NonRetryableTranscriptionError(
      'CRITICAL: ALLOW_MOCK_TRANSCRIPTION=true is strictly forbidden in production. Real transcription provider must be configured.',
    );
  }

  if (requestedMock && !hasKey) {
    console.warn(
      '[Transcription] [MOCK_ENABLED] ALLOW_MOCK_TRANSCRIPTION=true is active in non-production. Using MockTranscriptionService.',
    );
    return new MockTranscriptionService();
  }

  return new RealTranscriptionService();
}

