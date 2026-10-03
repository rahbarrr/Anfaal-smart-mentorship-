import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { transcribeAudioInChunks } from '../services/chunkedTranscriptionService.js';
import { MockTranscriptionService } from '../services/transcriptionService.js';

type BenchmarkResult = {
  file: string;
  bytes: number;
  durationSeconds: number;
  chunkCount: number;
  preparationMs: number;
  transcriptionMs: number;
  totalMs: number;
  partial: boolean;
  failedChunks: number;
};

async function benchmarkFile(filePath: string): Promise<BenchmarkResult> {
  const buffer = await fs.readFile(filePath);
  const originalname = path.basename(filePath);
  const startedAt = performance.now();
  const providerMode = (process.env.BENCHMARK_PROVIDER || 'mock').toLowerCase();
  if (!['real', 'mock'].includes(providerMode)) {
    throw new Error('BENCHMARK_PROVIDER must be either real or mock.');
  }
  const mockService = providerMode === 'mock' ? new MockTranscriptionService() : undefined;
  let preparationMs = 0;
  let durationSeconds = 0;
  let chunkCount = 0;

  const result = await transcribeAudioInChunks({
    buffer,
    originalname,
    mimetype: 'application/octet-stream',
    transcribeChunk: mockService ? (input) => mockService.transcribe(input) : undefined,
    onChunksPrepared: (total, duration) => {
      chunkCount = total;
      durationSeconds = duration;
      preparationMs = performance.now() - startedAt;
    },
  });

  const completedAt = performance.now();
  return {
    file: originalname,
    bytes: buffer.length,
    durationSeconds: result.duration || durationSeconds,
    chunkCount: result.chunkCount || chunkCount,
    preparationMs: Math.round(preparationMs),
    transcriptionMs: Math.round(completedAt - startedAt - preparationMs),
    totalMs: Math.round(completedAt - startedAt),
    partial: result.partial,
    failedChunks: result.chunks.filter((chunk) => Boolean(chunk.error)).length,
  };
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error('Usage: npm run benchmark:transcription -- path/to/recording.mp3 [path/to/another-recording.m4a]');
  }

  const concurrentRuns = Math.max(1, Math.min(4, Number(process.env.BENCHMARK_CONCURRENT_RUNS || 1)));
  const results: BenchmarkResult[] = [];
  for (let index = 0; index < files.length; index += concurrentRuns) {
    const batch = files.slice(index, index + concurrentRuns);
    results.push(...await Promise.all(batch.map(benchmarkFile)));
  }

  console.log(JSON.stringify({
    chunkSeconds: Number(process.env.TRANSCRIPTION_CHUNK_SECONDS || 90),
    transcriptionConcurrency: Number(process.env.TRANSCRIPTION_CONCURRENCY || 4),
    concurrentRuns,
    provider: (process.env.BENCHMARK_PROVIDER || 'mock').toLowerCase(),
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[TRANSCRIPTION_BENCHMARK_FAILED] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
