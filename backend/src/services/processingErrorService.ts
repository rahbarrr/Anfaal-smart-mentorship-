import { isNonRetryableTranscriptionError } from './transcriptionService.js';

export type ProcessingErrorCode =
  | 'INVALID_INPUT'
  | 'STORAGE_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'SUMMARY_FAILED'
  | 'QUEUE_FAILED'
  | 'UNKNOWN';

export function classifyProcessingError(error: unknown, stage: 'transcription' | 'summary'): { code: ProcessingErrorCode; retryable: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  if (isNonRetryableTranscriptionError(error)) return { code: 'INVALID_INPUT', retryable: false };
  if (/maximum supported duration|too many audio chunks|exceeds.*limit/i.test(message)) {
    return { code: 'INVALID_INPUT', retryable: false };
  }
  if (/storage|object|s3|bucket|download|retrieve/i.test(message) && stage === 'transcription') {
    return { code: 'STORAGE_FAILED', retryable: true };
  }
  if (stage === 'summary') return { code: 'SUMMARY_FAILED', retryable: true };
  if (/queue|redis|bullmq/i.test(message)) return { code: 'QUEUE_FAILED', retryable: true };
  return { code: 'TRANSCRIPTION_FAILED', retryable: true };
}
