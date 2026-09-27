import dotenv from 'dotenv';
dotenv.config();

export function validateEnvironment(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!process.env.MONGODB_URI) {
    if (isProd) {
      errors.push('MONGODB_URI is required in production.');
    } else {
      warnings.push('MONGODB_URI is not set. Defaulting to local MongoDB.');
    }
  }

  if (!process.env.JWT_SECRET) {
    if (isProd) {
      errors.push('JWT_SECRET is required in production.');
    } else {
      warnings.push('JWT_SECRET is not set. Using dev default.');
    }
  }

  if (isProd && !process.env.CLIENT_URL) {
    warnings.push('CLIENT_URL is not set in production. CORS may reject frontend requests.');
  }

  const hasS3 = Boolean(
    (process.env.STORAGE_BUCKET || process.env.AWS_STORAGE_BUCKET) &&
    (process.env.AWS_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY) &&
    (process.env.AWS_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_KEY),
  );

  if (isProd && !hasS3) {
    warnings.push('AWS S3 credentials (STORAGE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are not fully configured.');
  }

  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  if (isProd && !hasOpenAi) {
    warnings.push('OPENAI_API_KEY is not configured in production.');
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn('[Config] Environment warnings:\n - ' + warnings.join('\n - '));
  }

  if (errors.length > 0) {
    throw new Error('[Config] Fatal configuration errors:\n - ' + errors.join('\n - '));
  }
}
