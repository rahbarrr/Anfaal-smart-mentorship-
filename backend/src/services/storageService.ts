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
}

export class MockStorageProvider implements StorageProvider {
  async uploadFile(file: UploadedFile): Promise<{ url: string; key: string }> {
    return {
      url: `https://mock-storage.local/${file.originalname}`,
      key: `uploads/${Date.now()}-${file.originalname}`,
    };
  }

  async deleteFile(_key: string): Promise<void> {
    return;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `https://mock-storage.local/${key}`;
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
