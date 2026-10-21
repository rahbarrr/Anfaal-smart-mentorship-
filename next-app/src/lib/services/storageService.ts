import 'server-only';
import { getFirebaseAdmin } from '../firebase/admin';

export interface StorageService {
  getSignedUploadUrl(storageKey: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
  getSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  getObjectBuffer(storageKey: string): Promise<Buffer>;
  uploadBuffer(buffer: Buffer, storageKey: string, mimeType: string): Promise<{ url: string; key: string }>;
  deleteFile(storageKey: string): Promise<void>;
}

export class FirebaseStorageService implements StorageService {
  private getBucket() {
    const { adminStorage } = getFirebaseAdmin();
    const bucket = adminStorage.bucket();
    return bucket;
  }

  async getSignedUploadUrl(storageKey: string, mimeType: string, expiresInSeconds = 900): Promise<string> {
    const bucket = this.getBucket();
    const file = bucket.file(storageKey);
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const [signedUrl] = await file.getSignedUrl({
      action: 'write',
      expires: expiresAt,
      contentType: mimeType,
      version: 'v4',
    });

    return signedUrl;
  }

  async getSignedDownloadUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    const bucket = this.getBucket();
    const file = bucket.file(storageKey);
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
      version: 'v4',
    });

    return signedUrl;
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const bucket = this.getBucket();
    const file = bucket.file(storageKey);
    const [exists] = await file.exists();

    if (!exists) {
      throw new Error(`File does not exist in storage: ${storageKey}`);
    }

    const [buffer] = await file.download();
    return buffer;
  }

  async uploadBuffer(buffer: Buffer, storageKey: string, mimeType: string): Promise<{ url: string; key: string }> {
    const bucket = this.getBucket();
    const file = bucket.file(storageKey);

    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    return {
      url: `gs://${bucket.name}/${storageKey}`,
      key: storageKey,
    };
  }

  async deleteFile(storageKey: string): Promise<void> {
    const bucket = this.getBucket();
    const file = bucket.file(storageKey);
    const [exists] = await file.exists();

    if (exists) {
      await file.delete();
    }
  }
}

// Singleton storage service instance
let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageInstance) {
    storageInstance = new FirebaseStorageService();
  }
  return storageInstance;
}
