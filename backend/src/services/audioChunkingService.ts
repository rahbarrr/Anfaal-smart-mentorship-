import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFile = promisify(execFileCallback);

const MAX_AUDIO_DURATION_SECONDS = 6 * 60 * 60;
const MAX_AUDIO_CHUNKS = 480;

export interface AudioChunk {
  index: number;
  startSeconds: number;
  endSeconds: number;
  path: string;
  fileName: string;
  mimeType: string;
}

export interface PreparedAudioChunks {
  tempDir: string;
  durationSeconds: number;
  chunks: AudioChunk[];
  cleanup: () => Promise<void>;
}

export interface PrepareAudioChunksInput {
  buffer: Buffer;
  originalname: string;
  chunkSeconds?: number;
  overlapSeconds?: number;
}

function getExecutablePath(envName: string, fallback: string): string {
  return process.env[envName]?.trim() || fallback;
}

function getFfprobePath(): string {
  if (process.env.FFPROBE_PATH?.trim()) return process.env.FFPROBE_PATH.trim();

  const ffmpegPath = process.env.FFMPEG_PATH?.trim();
  if (ffmpegPath) {
    const baseName = path.basename(ffmpegPath).toLowerCase();
    if (baseName === 'ffmpeg' || baseName === 'ffmpeg.exe') {
      return path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    }
  }

  return 'ffprobe';
}

function safeExtension(originalname: string): string {
  const extension = path.extname(originalname || '').toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : '.audio';
}

function resolveMimeType(originalname: string): string {
  const extension = path.extname(originalname || '').toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg', '.mpga': 'audio/mpeg',
    '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.webm': 'audio/webm',
    '.aac': 'audio/aac', '.flac': 'audio/flac',
  };
  return mimeTypes[extension] || 'audio/mpeg';
}

async function getDurationSeconds(inputPath: string): Promise<number> {
  const { stdout } = await execFile(getFfprobePath(), [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Unable to determine the recording duration.');
  }
  return duration;
}

export async function prepareAudioChunks({
  buffer,
  originalname,
  chunkSeconds = 90,
  overlapSeconds = 1,
}: PrepareAudioChunksInput): Promise<PreparedAudioChunks> {
  if (!buffer || buffer.length === 0) throw new Error('Audio recording buffer is empty.');
  if (!Number.isFinite(chunkSeconds) || chunkSeconds <= 0) throw new Error('Chunk duration must be greater than zero.');
  if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0 || overlapSeconds >= chunkSeconds) {
    throw new Error('Chunk overlap must be zero or greater and smaller than the chunk duration.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anfaal-audio-'));
  const inputPath = path.join(tempDir, `source${safeExtension(originalname)}`);

  try {
    await fs.writeFile(inputPath, buffer);
    const durationSeconds = await getDurationSeconds(inputPath);
    const chunkCount = Math.ceil(durationSeconds / chunkSeconds);
    if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error('Recording exceeds the maximum supported duration of 6 hours.');
    }
    if (chunkCount > MAX_AUDIO_CHUNKS) {
      throw new Error('Recording produces too many audio chunks for safe processing.');
    }
    const sourceMimeType = resolveMimeType(originalname);
    const sourceFileName = path.basename(originalname || 'recording.audio') || 'recording.audio';

    // Short recordings do not need to be decoded and re-encoded. Passing the
    // original file directly avoids an unnecessary FFmpeg round trip.
    if (chunkCount === 1) {
      return {
        tempDir,
        durationSeconds,
        chunks: [{
          index: 0,
          startSeconds: 0,
          endSeconds: durationSeconds,
          path: inputPath,
          fileName: sourceFileName,
          mimeType: sourceMimeType,
        }],
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
      };
    }

    const ffmpegPath = getExecutablePath('FFMPEG_PATH', 'ffmpeg');
    const chunks: Array<AudioChunk | undefined> = [];
    const configuredPreparationConcurrency = Number(process.env.AUDIO_PREP_CONCURRENCY || 2);
    const preparationConcurrency = Math.min(
      chunkCount,
      Number.isFinite(configuredPreparationConcurrency) && configuredPreparationConcurrency > 0
        ? Math.floor(configuredPreparationConcurrency)
        : 1,
    );

    const createChunk = async (index: number): Promise<void> => {
      const logicalStart = index * chunkSeconds;
      const startSeconds = Math.max(0, logicalStart - (index === 0 ? 0 : overlapSeconds));
      const endSeconds = Math.min(durationSeconds, logicalStart + chunkSeconds + (index === chunkCount - 1 ? 0 : overlapSeconds));
      const outputPath = path.join(tempDir, `chunk-${String(index).padStart(4, '0')}.mp3`);

      await execFile(ffmpegPath, [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', startSeconds.toFixed(3),
        '-i', inputPath,
        '-t', (endSeconds - startSeconds).toFixed(3),
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        outputPath,
      ]);

      chunks[index] = {
        index,
        startSeconds,
        endSeconds,
        path: outputPath,
        fileName: `chunk-${String(index).padStart(4, '0')}.mp3`,
        mimeType: 'audio/mpeg',
      };
    };

    let nextIndex = 0;
    await Promise.all(Array.from({ length: preparationConcurrency }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= chunkCount) return;
        await createChunk(index);
      }
    }));

    return {
      tempDir,
      durationSeconds,
      chunks: chunks.filter((chunk): chunk is AudioChunk => Boolean(chunk)),
      cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Audio preparation failed: ${message}`);
  }
}
