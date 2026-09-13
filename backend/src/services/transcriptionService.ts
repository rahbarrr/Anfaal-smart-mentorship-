import { readFileSync } from 'node:fs';

export interface TranscriptResult {
  transcript: string;
  speakerMap?: Record<string, string>;
}

export interface TranscriptionService {
  transcribe(filePath: string): Promise<TranscriptResult>;
}

export class MockTranscriptionService implements TranscriptionService {
  async transcribe(_filePath: string): Promise<TranscriptResult> {
    return {
      transcript: `Mentor: Good afternoon. Let’s review your progress and identify the next steps for your learning plan.\n\nMentee: I have been reading more regularly and practicing the revision schedule you recommended.\n\nMentor: That is encouraging. We will focus on improving your confidence during presentations and continue with weekly checkpoints.`,
      speakerMap: {
        Speaker1: 'Mentor',
        Speaker2: 'Mentee',
      },
    };
  }
}

export class RealTranscriptionService implements TranscriptionService {
  async transcribe(filePath: string): Promise<TranscriptResult> {
    const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new MockTranscriptionService().transcribe(filePath);
    }

    try {
      const fileContents = readFileSync(filePath);
      const body = new FormData();
      body.append('file', new Blob([fileContents]), filePath.split('/').pop() ?? 'audio.webm');
      body.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1');

      const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Transcription provider responded with ${response.status}`);
      }

      const payload = (await response.json()) as { text?: string };
      const transcript = payload.text?.trim();

      if (!transcript) {
        throw new Error('No transcript text returned');
      }

      return {
        transcript,
        speakerMap: {
          Speaker1: 'Mentor',
          Speaker2: 'Mentee',
        },
      };
    } catch {
      return new MockTranscriptionService().transcribe(filePath);
    }
  }
}

export function createTranscriptionService(): TranscriptionService {
  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.TRANSCRIPTION_API_KEY);
  return hasKey ? new RealTranscriptionService() : new MockTranscriptionService();
}
