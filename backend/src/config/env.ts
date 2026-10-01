import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  mongoUri: string;
  jwtSecret: string;
  clientUrl: string;
  redisUrl: string;
  awsRegion: string;
  awsEndpoint?: string;
  storageBucket: string;
  openaiTranscriptionModel: string;
}

export function validateEnvironment(isWorker = false): void {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];
  const authProvider = (process.env.AUTH_PROVIDER || 'jwt').toLowerCase();

  if (!['jwt', 'supabase'].includes(authProvider)) {
    errors.push('AUTH_PROVIDER must be either jwt or supabase.');
  }

  if (authProvider === 'supabase' && !isWorker) {
    if (!process.env.SUPABASE_URL) errors.push('SUPABASE_URL is required when AUTH_PROVIDER=supabase.');
    if (!(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) {
      errors.push('SUPABASE_PUBLISHABLE_KEY is required when AUTH_PROVIDER=supabase.');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY is required by the backend when AUTH_PROVIDER=supabase.');
    }
  }

  // Database
  if (!process.env.MONGODB_URI) {
    if (isProd) {
      errors.push('MONGODB_URI is required in production (MongoDB Atlas connection string).');
    } else {
      warnings.push('MONGODB_URI is not set. Defaulting to local MongoDB.');
    }
  }

  // Queue / Redis
  if (!process.env.REDIS_URL) {
    if (isProd) {
      errors.push('REDIS_URL is required in production for BullMQ background processing.');
    } else {
      warnings.push('REDIS_URL is not set. Local development queue access will be unavailable unless Redis is running.');
    }
  }

  // Authentication (API needs it, good to have across both)
  if (!process.env.JWT_SECRET) {
    if (isProd) {
      errors.push('JWT_SECRET is required in production.');
    } else {
      warnings.push('JWT_SECRET is not set. Authentication endpoints will be unavailable until it is configured.');
    }
  } else if (isProd && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
  }

  // Frontend CORS (API only)
  if (!isWorker && isProd && !process.env.CLIENT_URL) {
    errors.push('CLIENT_URL is required in production for an explicit CORS allowlist.');
  }

  if (!isWorker && isProd && process.env.DISABLE_BOOTSTRAP_ADMIN !== 'true') {
    if (!process.env.BOOTSTRAP_ADMIN_EMAIL || !process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      errors.push('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required unless DISABLE_BOOTSTRAP_ADMIN=true.');
    }
  }

  // AWS S3 Private Storage
  const hasS3 = Boolean(
    (process.env.STORAGE_BUCKET || process.env.AWS_STORAGE_BUCKET) &&
    (process.env.AWS_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY) &&
    (process.env.AWS_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_KEY),
  );

  if (isProd && !hasS3) {
    errors.push('AWS S3 credentials (STORAGE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are required in production.');
  }

  // OpenAI
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  if (isProd && !hasOpenAi) {
    errors.push('OPENAI_API_KEY is required in production for Whisper transcription and AI summarization.');
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn('[Config] Environment warnings:\n - ' + warnings.join('\n - '));
  }

  if (errors.length > 0) {
    throw new Error('[Config] Fatal configuration errors:\n - ' + errors.join('\n - '));
  }
}

export function getConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/anfaal',
    jwtSecret: process.env.JWT_SECRET || '',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    awsEndpoint: process.env.AWS_ENDPOINT || process.env.S3_ENDPOINT || undefined,
    storageBucket: process.env.STORAGE_BUCKET || process.env.AWS_STORAGE_BUCKET || '',
    openaiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
  };
}
