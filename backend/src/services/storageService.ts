import fs from 'fs';
import path from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadedFile = {
  originalname: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export interface StorageProvider {
  uploadFile(file: UploadedFile): Promise<{ url: string; key: string }>;
  deleteFile(key: string): Promise<void>;
  getSignedUrl?(key: string): Promise<string>;
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

  async uploadFile(file: UploadedFile): Promise<{ url: string; key: string }> {
    const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadsDir, filename);

    if (file.buffer) {
      try {
        await fs.promises.writeFile(filePath, file.buffer);
      } catch (err) {
        console.error('[MockStorage] Failed to write local recording:', err);
      }
    }

    return {
      url: `/api/recordings/${filename}`,
      key: filename,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.uploadsDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/api/recordings/${key}`;
  }

  getFilePath(key: string): string | null {
    if (!key) return null;
    const cleanKey = path.basename(key);
    const filePath = path.join(this.uploadsDir, cleanKey);
    return fs.existsSync(filePath) ? filePath : null;
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    const bucket = process.env.STORAGE_BUCKET;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    const region = process.env.AWS_REGION ?? 'us-east-1';

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 storage requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY.');
    }

    this.bucket = bucket;
    this.region = region;
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: UploadedFile): Promise<{ url: string; key: string }> {
    const key = `uploads/${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer ?? Buffer.from(''),
      ContentType: file.mimetype ?? 'application/octet-stream',
      ACL: 'private',
    });

    await this.client.send(command);

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { url, key };
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }
}

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER?.toLowerCase();

  if (provider === 's3') {
    try {
      return new S3StorageProvider();
    } catch {
      return new MockStorageProvider();
    }
  }

  return new MockStorageProvider();
}
