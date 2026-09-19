export interface TranscriptInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface TranscriptResult {
  transcript: string;
  speakerMap?: Record<string, string>;
}

export interface TranscriptionService {
  transcribe(input: TranscriptInput): Promise<TranscriptResult>;
}

export class MockTranscriptionService implements TranscriptionService {
  async transcribe(_input: TranscriptInput): Promise<TranscriptResult> {
    return {
      transcript: `Mentor: Good afternoon. Let's review your progress and identify the next steps for your learning plan.\n\nMentee: I have been reading more regularly and practicing the revision schedule you recommended.\n\nMentor: That is encouraging. We will focus on improving your confidence during presentations and continue with weekly checkpoints.`,
      speakerMap: {
        Speaker1: 'Mentor',
        Speaker2: 'Mentee',
      },
    };
  }
}

export class RealTranscriptionService implements TranscriptionService {
  async transcribe({ buffer, originalname, mimetype }: TranscriptInput): Promise<TranscriptResult> {
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
    }

    try {
      const body = new FormData();

      // Send the in-memory buffer directly as a Blob — no disk write needed
      const blob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'audio/mpeg' });
      body.append('file', blob, originalname);
      body.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1');

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

      const payload = (await response.json()) as { text?: string };
      const transcript = payload.text?.trim();

      if (!transcript) {
        throw new Error('No transcript text returned from Whisper');
      }

      return {
        transcript,
        speakerMap: {
          Speaker1: 'Mentor',
          Speaker2: 'Mentee',
        },
      };
    } catch (err) {
      console.error('[Transcription] Whisper error, falling back to mock:', err instanceof Error ? err.message : err);
      return new MockTranscriptionService().transcribe({ buffer, originalname, mimetype });
    }
  }
}

export function createTranscriptionService(): TranscriptionService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.TRANSCRIPTION_API_KEY);
  return hasKey ? new RealTranscriptionService() : new MockTranscriptionService();
}
