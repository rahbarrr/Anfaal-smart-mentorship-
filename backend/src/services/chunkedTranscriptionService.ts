import fs from 'node:fs/promises';
import { prepareAudioChunks, PrepareAudioChunksInput, PreparedAudioChunks } from './audioChunkingService.js';
import {
  createTranscriptionService,
  isFatalAuthOrClientError,
  isNonRetryableTranscriptionError,
  TranscriptInput,
  TranscriptionResult,
  TranscriptSegment,
} from './transcriptionService.js';

export interface ChunkTranscriptionResult {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  language?: string;
  duration?: number;
  segments: TranscriptSegment[];
  provider?: string;
  attempts: number;
  error?: string;
}

export interface ChunkedTranscriptionInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  concurrency?: number;
  chunkSeconds?: number;
  overlapSeconds?: number;
  maxAttempts?: number;
  prepareChunks?: (input: PrepareAudioChunksInput) => Promise<PreparedAudioChunks>;
  transcribeChunk?: (input: TranscriptInput) => Promise<TranscriptionResult>;
  onChunksPrepared?: (total: number, durationSeconds: number) => Promise<void> | void;
  onChunkCompleted?: (result: ChunkTranscriptionResult, completed: number, total: number) => Promise<void> | void;
}

export interface ChunkedTranscriptionResult {
  text: string;
  language?: string;
  duration: number;
  segments: TranscriptSegment[];
  provider: string;
  chunks: ChunkTranscriptionResult[];
  partial: boolean;
  preparationMs: number;
  chunkCount: number;
  chunkSeconds: number;
}

export function normalizedTranscriptionConcurrency(value: number | undefined): number {
  const configured = Number(value ?? process.env.TRANSCRIPTION_CONCURRENCY ?? 4);
  const maxConfigured = Number(process.env.TRANSCRIPTION_MAX_CONCURRENCY || 6);
  const maximum = Number.isFinite(maxConfigured) && maxConfigured > 0 ? Math.floor(maxConfigured) : 6;
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.floor(configured), maximum) : 1;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `[${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}]`;
}

export function mergeChunkResults(results: ChunkTranscriptionResult[], duration: number, chunkSeconds: number): { text: string; segments: TranscriptSegment[] } {
  const segments: TranscriptSegment[] = [];

  for (const result of [...results].sort((a, b) => a.index - b.index)) {
    const logicalBoundary = result.index * chunkSeconds;
    for (const segment of result.segments) {
      const adjusted = {
        ...segment,
        start: Math.max(0, segment.start + result.startSeconds),
        end: Math.min(duration, segment.end + result.startSeconds),
      };
      // The previous chunk owns the overlap window. Keep the first segment
      // whose local timestamp starts at/after the logical boundary so the
      // same spoken phrase is not duplicated in the merged transcript.
      if (result.index > 0 && adjusted.start < logicalBoundary) continue;
      segments.push(adjusted);
    }
  }

  if (segments.length === 0) {
    const fallbackText = [...results]
      .sort((a, b) => a.index - b.index)
      .map((result) => result.text.trim())
      .filter(Boolean)
      .join('\n\n');
    return { text: fallbackText, segments: [] };
  }

  const text = segments
    .map((segment) => `${formatTimestamp(segment.start)} ${segment.speaker ? `${segment.speaker}: ` : ''}${segment.text.trim()}`)
    .join('\n\n');
  return { text, segments };
}

export async function transcribeAudioInChunks(input: ChunkedTranscriptionInput): Promise<ChunkedTranscriptionResult> {
  const preparationStartedAt = Date.now();
  const prepare = input.prepareChunks || prepareAudioChunks;
  const prepared = await prepare({
    buffer: input.buffer,
    originalname: input.originalname,
    chunkSeconds: input.chunkSeconds,
    overlapSeconds: input.overlapSeconds,
  });
  const preparationMs = Date.now() - preparationStartedAt;
  await input.onChunksPrepared?.(prepared.chunks.length, prepared.durationSeconds);
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 3));
  const transcriptionService = input.transcribeChunk ? undefined : createTranscriptionService();
  const transcribeChunk = input.transcribeChunk || transcriptionService!.transcribe.bind(transcriptionService);
  const results: ChunkTranscriptionResult[] = [];
  let nextIndex = 0;
  let completed = 0;
  const concurrency = Math.min(normalizedTranscriptionConcurrency(input.concurrency), prepared.chunks.length);
  let fatalError: unknown = null;

  const processNext = async (): Promise<void> => {
    while (true) {
      if (fatalError) return;
      const index = nextIndex;
      nextIndex += 1;
      const chunk = prepared.chunks[index];
      if (!chunk) return;

      let lastError = '';
      let attempts = 0;
      let result: Awaited<ReturnType<ReturnType<typeof createTranscriptionService>['transcribe']>> | undefined;

      while (attempts < maxAttempts && !result) {
        if (fatalError) break;
        attempts += 1;
        try {
          const chunkBuffer = await fs.readFile(chunk.path);
          const rawResult = await transcribeChunk({
            buffer: chunkBuffer,
            originalname: chunk.fileName,
            mimetype: chunk.mimeType,
            allowEmpty: true,
          });
          if (!rawResult || typeof rawResult !== 'object' || typeof rawResult.text !== 'string') {
            throw new Error(`Chunk ${chunk.index} returned invalid result format.`);
          }
          result = rawResult;
        } catch (error) {
          result = undefined;
          lastError = error instanceof Error ? error.message : String(error);
          const nonRetryable = isNonRetryableTranscriptionError(error);
          if (nonRetryable) {
            console.warn(`[Transcription] Chunk ${chunk.index} failed with non-retryable error (attempt ${attempts}): ${lastError}`);
            if (isFatalAuthOrClientError(error)) {
              fatalError = error;
            }
            break;
          }
          if (attempts < maxAttempts) {
            const delayMs = Math.min(3000, attempts * 500);
            console.warn(`[Transcription] Chunk ${chunk.index} failed (attempt ${attempts}/${maxAttempts}), retrying in ${delayMs}ms: ${lastError}`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            console.error(`[Transcription] Chunk ${chunk.index} failed after ${attempts} attempts: ${lastError}`);
          }
        }
      }

      const chunkResult: ChunkTranscriptionResult = {
        index: chunk.index,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        text: result?.text || '',
        language: result?.language,
        duration: result?.duration,
        segments: result?.segments || [],
        provider: result?.provider,
        attempts,
        ...(result ? {} : { error: lastError || 'Chunk transcription failed.' }),
      };
      results.push(chunkResult);
      completed += 1;
      await input.onChunkCompleted?.(chunkResult, completed, prepared.chunks.length);
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => processNext()));
  } finally {
    await prepared.cleanup();
  }

  // Populate any unstarted chunks if execution was aborted due to fatal auth/client error
  const processedIndexes = new Set(results.map((r) => r.index));
  for (const chunk of prepared.chunks) {
    if (!processedIndexes.has(chunk.index)) {
      results.push({
        index: chunk.index,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        text: '',
        segments: [],
        attempts: 0,
        error: fatalError instanceof Error ? fatalError.message : 'Transcription aborted due to fatal error in preceding chunk.',
      });
    }
  }

  const resolvedChunkSeconds = Number(
    input.chunkSeconds
      ?? (prepared.chunks[0] && prepared.chunks[1] ? prepared.chunks[1].startSeconds - prepared.chunks[0].startSeconds : undefined)
      ?? process.env.TRANSCRIPTION_CHUNK_SECONDS
      ?? 90,
  );

  const sortedResults = results.sort((a, b) => a.index - b.index);
  const merged = mergeChunkResults(sortedResults, prepared.durationSeconds, resolvedChunkSeconds);
  const language = sortedResults.find((result) => result.language)?.language;
  const provider = sortedResults.find((result) => result.provider)?.provider || 'openai-whisper-chunked';

  return {
    ...merged,
    language,
    duration: prepared.durationSeconds,
    provider,
    chunks: sortedResults,
    partial: sortedResults.some((result) => Boolean(result.error)),
    preparationMs,
    chunkCount: prepared.chunks.length,
    chunkSeconds: resolvedChunkSeconds,
  };
}
