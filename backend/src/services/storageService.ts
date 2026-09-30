import fs from 'fs';
import path from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type UploadedFile = {
  originalname: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export interface StorageProvider {
  getPresignedUploadUrl(storageKey: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  getObjectBuffer(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
  uploadFile(file: UploadedFile, key?: string): Promise<{ url: string; key: string }>;
  getFilePath?(key: string): string | null;
}

export class MockStorageProvider implements StorageProvider {
  private uploadsDir: string;

  constructor() {
    this.uploadsDir = path.resolve(process.cwd(), 'uploads', 'recordings');
    if (!fs.existsSync(this.uploadsDir)) {
      try {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  }

  async getPresignedUploadUrl(storageKey: string, _mimeType: string, _expiresInSeconds = 900): Promise<string> {
    return `/api/calls/mock-upload/${encodeURIComponent(storageKey)}`;
  }

  async getSignedUrl(storageKey: string, _expiresInSeconds = 3600): Promise<string> {
    return `/api/calls/mock-audio/${encodeURIComponent(storageKey)}`;
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const cleanKey = path.basename(storageKey);
    const candidatePaths = [
      path.join(this.uploadsDir, storageKey),
      path.join(this.uploadsDir, cleanKey),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return fs.promises.readFile(p);
      }
    }

    throw new Error(`Local recording file not found for key: ${storageKey}`);
  }

  async uploadFile(file: UploadedFile, customKey?: string): Promise<{ url: string; key: string }> {
    const filename = customKey || `calls/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const cleanBasename = path.basename(filename);
    const filePath = path.join(this.uploadsDir, cleanBasename);

    if (file.buffer) {
      try {
        await fs.promises.writeFile(filePath, file.buffer);
      } catch (err) {
        console.error('[MockStorage] Failed to write local recording:', err);
      }
    }

    return {
      url: `/api/recordings/${cleanBasename}`,
      key: filename,
    };
  }

  async deleteFile(storageKey: string): Promise<void> {
    const cleanKey = path.basename(storageKey);
    const candidatePaths = [
      path.join(this.uploadsDir, storageKey),
      path.join(this.uploadsDir, cleanKey),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p).catch(() => {});
      }
    }
  }

  getFilePath(storageKey: string): string | null {
    if (!storageKey) return null;
    const cleanKey = path.basename(storageKey);
    const candidatePaths = [
      path.join(this.uploadsDir, storageKey),
      path.join(this.uploadsDir, cleanKey),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    const bucket = process.env.STORAGE_BUCKET || process.env.AWS_STORAGE_BUCKET;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_KEY;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 storage requires STORAGE_BUCKET (or AWS_STORAGE_BUCKET), AWS_ACCESS_KEY_ID (or STORAGE_ACCESS_KEY), and AWS_SECRET_ACCESS_KEY (or STORAGE_SECRET_KEY).',
      );
    }

    const endpoint = process.env.AWS_ENDPOINT || process.env.S3_ENDPOINT;

    this.bucket = bucket;
    this.region = region;
    this.client = new S3Client({
      region: this.region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: Boolean(endpoint),
    });
  }

  async getPresignedUploadUrl(storageKey: string, mimeType: string, expiresInSeconds = 900): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType || 'audio/mpeg',
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`S3 object body is empty for key: ${storageKey}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async uploadFile(file: UploadedFile, customKey?: string): Promise<{ url: string; key: string }> {
    const key = customKey || `calls/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/call_${Date.now()}/${file.originalname.replace(/\s+/g, '-')}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer ?? Buffer.from(''),
      ContentType: file.mimetype ?? 'application/octet-stream',
    });

    await this.client.send(command);

    const url = await this.getSignedUrl(key);
    return { url, key };
  }

  async deleteFile(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}

export function createStorageProvider(): StorageProvider {
  const isProd = process.env.NODE_ENV === 'production';
  const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
  const hasS3Config = Boolean(
    (process.env.STORAGE_BUCKET || process.env.AWS_STORAGE_BUCKET) &&
    (process.env.AWS_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY) &&
    (process.env.AWS_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_KEY),
  );

  // In production, AWS S3 is mandatory; silent fallback to mock local storage is disallowed
  if (isProd) {
    if (!hasS3Config && provider !== 's3') {
      throw new Error('[Storage] AWS S3 configuration (STORAGE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) is required in production.');
    }
    return new S3StorageProvider();
  }

  if (provider === 's3' || hasS3Config) {
    try {
      return new S3StorageProvider();
    } catch (err) {
      console.warn('[Storage] Failed to initialize S3 provider, falling back to mock:', err instanceof Error ? err.message : err);
      return new MockStorageProvider();
    }
  }

  return new MockStorageProvider();
}

