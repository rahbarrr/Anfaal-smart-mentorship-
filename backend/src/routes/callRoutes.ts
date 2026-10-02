import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { User } from '../models/User.js';
import { createStorageProvider, S3StorageProvider } from '../services/storageService.js';
import { enqueueCallProcessingJob } from '../services/callProcessingService.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

// Allowed MIME types for recordings
const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'video/mp4',
  'video/webm',
];

const MAX_RECORDING_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB for direct S3 upload validation
const MAX_MULTER_FALLBACK_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit for legacy multipart upload to protect server memory

// ─── Multer (for fallback multipart uploads only) ───────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MULTER_FALLBACK_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (
  ALLOWED_MIME_TYPES.includes(file.mimetype) ||
  file.originalname.match(/\.(mp3|wav|m4a|mp4|webm|ogg|aac)$/i) ||
  file.mimetype === 'application/octet-stream'
) {
  cb(null, true);
} else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── Validation Schemas ─────────────────────────────────────────────────────
const presignUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().min(1).max(MAX_RECORDING_SIZE_BYTES),
  mimeType: z.string().refine((m) => ALLOWED_MIME_TYPES.includes(m) || m.startsWith('audio/'), {
    message: 'Invalid or unsupported audio MIME type.',
  }),
  menteeId: z.string().min(1),
});

const completeUploadSchema = z.object({
  storageKey: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  menteeId: z.string().min(1),
  duration: z.number().min(1),
  date: z.string().optional(),
  mentorNotes: z.string().optional(),
});

// Helper to sanitize filenames
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: Resolve mentor profile ID and check authorization
// ──────────────────────────────────────────────────────────────────────────
async function getMentorProfileId(userId: string): Promise<string> {
  const profile = await Mentor.findOne({ userId });
  return profile ? String(profile._id) : userId;
}

async function verifyMentorMenteeAccess(mentorUserId: string, menteeId: string): Promise<boolean> {
  const mentorProfile = await Mentor.findOne({ userId: mentorUserId });
  const mentorIds = [mentorUserId, ...(mentorProfile ? [String(mentorProfile._id)] : [])];

  const assignment = await Mentorship.findOne({
    mentorId: { $in: mentorIds },
    menteeId,
    status: 'active',
  });

  return Boolean(assignment);
}

// ──────────────────────────────────────────────────────────────────────────
// 1. POST /api/calls/presign-upload — direct private S3 upload URL
// ──────────────────────────────────────────────────────────────────────────
router.post('/presign-upload', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors and administrators can upload call recordings.' });
    }

    const parsed = presignUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid upload request parameters.',
        errors: parsed.error.issues,
      });
    }

    const { fileName, fileSize, mimeType, menteeId } = parsed.data;

    // Mentor authorization check
    if (req.user.role === 'MENTOR') {
      const isAuthorized = await verifyMentorMenteeAccess(req.user.id, menteeId);
      if (!isAuthorized) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this mentee.' });
      }
    }

    const cleanName = sanitizeFileName(fileName);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const uniqueId = crypto.randomUUID().slice(0, 10);
    // Secure private S3 object key
    const storageKey = `calls/${year}/${month}/call_${uniqueId}/${cleanName}`;

    const storageProvider = createStorageProvider();
    const uploadUrl = await storageProvider.getPresignedUploadUrl(storageKey, mimeType, 900); // 15 mins expiry

    return res.json({
      uploadUrl,
      storageKey,
      fileName: cleanName,
      fileSize,
      mimeType,
      expiresIn: 900,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate presigned upload URL';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 2. POST /api/calls/complete-upload — finalize call record & enqueue BullMQ
// ──────────────────────────────────────────────────────────────────────────
router.post('/complete-upload', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors and administrators can register call sessions.' });
    }

    const parsed = completeUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Please provide valid call session details.',
        errors: parsed.error.issues,
      });
    }

    const { storageKey, fileName, fileSize, mimeType, menteeId, duration, date, mentorNotes } = parsed.data;

    if (req.user.role === 'MENTOR') {
      const isAuthorized = await verifyMentorMenteeAccess(req.user.id, menteeId);
      if (!isAuthorized) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this mentee.' });
      }
    }

    const mentorId = req.user.role === 'MENTOR' ? await getMentorProfileId(req.user.id) : req.user.id;
    const hasRecording = Boolean(storageKey);

    // Create the Call document
    const call = await Call.create({
      mentorId,
      menteeId,
      date: date ? new Date(date) : new Date(),
      duration,
      recording: hasRecording
        ? {
            storageKey: storageKey!,
            fileName: fileName || path.basename(storageKey!),
            fileSize: fileSize || 0,
            mimeType: mimeType || 'audio/mpeg',
          }
        : undefined,
      recordingStatus: hasRecording ? 'uploaded' : 'pending',
      reviewStatus: 'Draft',
      aiStatus: 'pending',
      'transcription.status': 'PENDING',
      'aiSummary.status': 'PENDING',
      mentorNotes: mentorNotes || '',
    });

    // Create the initial CallProcessingJob record
    const job = await CallProcessingJob.create({
      callId: String(call._id),
      stage: 'UPLOAD',
      status: 'PROCESSING',
      progress: 5,
      stageStatus: {
        upload: 'COMPLETED',
        audioProcessing: 'PENDING',
        transcription: 'PENDING',
        summary: 'PENDING',
        mentorReview: 'PENDING',
      },
      startedAt: new Date(),
    });

    // Enqueue background processing job to BullMQ
    await enqueueCallProcessingJob({
      callId: String(call._id),
      jobId: String(job._id),
      mentorNotes,
      skipTranscription: !hasRecording,
    });

    const menteeDoc = await Mentee.findById(menteeId).lean();

    // Log Audit Events
    logAuditEvent({
      userId: req.user.id,
      userName: req.user.email,
      userRole: req.user.role,
      action: 'CALL_CREATED',
      targetType: 'CALL',
      targetId: String(call._id),
      menteeName: menteeDoc?.name,
      details: `Created mentorship call record (${duration} mins)`,
      ipAddress: req.ip,
    });

    if (hasRecording) {
      logAuditEvent({
        userId: req.user.id,
        userName: req.user.email,
        userRole: req.user.role,
        action: 'RECORDING_UPLOADED',
        targetType: 'CALL',
        targetId: String(call._id),
        menteeName: menteeDoc?.name,
        details: `Uploaded recording directly to S3: ${fileName || storageKey}`,
        ipAddress: req.ip,
      });
    }

    return res.status(201).json({
      message: 'Call record created and processing job enqueued.',
      callId: String(call._id),
      jobId: String(job._id),
      status: 'PROCESSING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete call upload';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 3. POST /api/calls/upload — backward-compatible fallback upload route
// ──────────────────────────────────────────────────────────────────────────
router.post('/upload', requireAuth, upload.single('recording'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors can upload call records.' });
    }

    const mentorId = req.user.role === 'MENTOR' ? await getMentorProfileId(req.user.id) : req.user.id;
    const { menteeId, duration, date, mentorNotes } = req.body;

    if (!menteeId || !duration) {
      return res.status(400).json({ message: 'menteeId and duration are required.' });
    }

    let storageKey: string | undefined;
    let fileName: string | undefined;

    if (req.file) {
      const storageProvider = createStorageProvider();
      const cleanName = sanitizeFileName(req.file.originalname);
      const uniqueId = crypto.randomUUID().slice(0, 10);
      const customKey = `calls/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/call_${uniqueId}/${cleanName}`;

      const uploadResult = await storageProvider.uploadFile(
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
        customKey,
      );

      storageKey = uploadResult.key;
      fileName = cleanName;
    }

    const call = await Call.create({
      mentorId,
      menteeId,
      duration: Number(duration),
      date: date ? new Date(date) : new Date(),
      recording: storageKey
        ? {
            storageKey,
            fileName: fileName || 'recording.m4a',
            fileSize: req.file?.size || 0,
            mimeType: req.file?.mimetype || 'audio/mpeg',
          }
        : undefined,
      recordingStatus: storageKey ? 'uploaded' : 'pending',
      reviewStatus: 'Draft',
      aiStatus: 'pending',
      mentorNotes: mentorNotes || '',
    });

    const job = await CallProcessingJob.create({
      callId: String(call._id),
      stage: 'UPLOAD',
      status: 'PROCESSING',
      progress: 5,
      stageStatus: {
        upload: 'COMPLETED',
        audioProcessing: 'PENDING',
        transcription: 'PENDING',
        summary: 'PENDING',
        mentorReview: 'PENDING',
      },
      startedAt: new Date(),
    });

    await enqueueCallProcessingJob({
      callId: String(call._id),
      jobId: String(job._id),
      mentorNotes,
      skipTranscription: !storageKey,
    });

    const menteeDoc = await Mentee.findById(menteeId).lean();
    logAuditEvent({
      userId: req.user.id,
      userName: req.user.email,
      userRole: req.user.role,
      action: 'CALL_CREATED',
      targetType: 'CALL',
      targetId: String(call._id),
      menteeName: menteeDoc?.name,
      details: `Uploaded call record for ${menteeDoc?.name || 'mentee'} (${duration} mins)`,
      ipAddress: req.ip,
    });

    return res.status(202).json({
      message: 'Upload accepted. Background processing enqueued.',
      callId: String(call._id),
      jobId: String(job._id),
      status: 'PROCESSING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload call';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 4. GET /api/calls — list visible calls
// ──────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let filter: Record<string, unknown> = {};

    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const ids = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      filter = { mentorId: { $in: ids } };
    } else if (req.user?.role === 'MENTEE') {
      const menteeIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      filter = { menteeId: { $in: menteeIds } };
    }

    const calls = await Call.find(filter).sort({ date: -1 }).lean();

    const menteeCache = new Map<string, string>();
    const mentorCache = new Map<string, string>();

    const enrichedCalls = await Promise.all(
      calls.map(async (call) => {
        let menteeName = menteeCache.get(call.menteeId);
        if (!menteeName) {
          const mentee = await Mentee.findById(call.menteeId).lean();
          menteeName = mentee?.name || 'Mentee';
          menteeCache.set(call.menteeId, menteeName);
        }

        let mentorName = mentorCache.get(call.mentorId);
        if (!mentorName) {
          const mentorProfile = await Mentor.findById(call.mentorId).lean();
          if (mentorProfile) {
            const u = await User.findById(mentorProfile.userId).lean();
            mentorName = u?.name || 'Mentor';
          } else {
            const u = await User.findById(call.mentorId).lean();
            mentorName = u?.name || 'Mentor';
          }
          mentorCache.set(call.mentorId, mentorName);
        }

        return {
          id: String(call._id),
          mentorId: call.mentorId,
          mentorName,
          menteeId: call.menteeId,
          menteeName,
          date: call.date,
          duration: call.duration,
          status: call.reviewStatus,
          aiStatus: call.aiStatus,
          recordingStatus: call.recordingStatus,
          summary: call.aiSummary?.shortSummary || call.summary || 'Processing…',
          hasTranscript: Boolean(call.transcript || call.transcription?.text),
          topicsDiscussed: call.topicsDiscussed ?? [],
          hasRecording: Boolean(call.recording?.storageKey || call.recordingUrl || call.recording?.url),
        };
      }),
    );

    return res.json({ calls: enrichedCalls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load calls';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 5. GET /api/calls/:id — full call detail
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    // Authorization
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      const isCaller = allowedIds.includes(call.mentorId);
      const isAssigned = mentorProfile
        ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId: call.menteeId, status: 'active' }).lean()
        : null;
      if (!isCaller && !isAssigned) {
        return res.status(403).json({ message: 'Access denied: You are not assigned to this mentee or call.' });
      }
    } else if (req.user?.role === 'MENTEE') {
      const menteeIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      if (!menteeIds.includes(call.menteeId)) {
        return res.status(403).json({ message: 'Access denied: You can only view your own call records.' });
      }
    }

    const mentee = await Mentee.findById(call.menteeId).lean();
    let mentorName = 'Mentor';
    const mentorProfile = await Mentor.findById(call.mentorId).lean();
    if (mentorProfile) {
      const u = await User.findById(mentorProfile.userId).lean();
      if (u) mentorName = u.name;
    } else {
      const u = await User.findById(call.mentorId).lean();
      if (u) mentorName = u.name;
    }

    const job = await CallProcessingJob.findOne({ callId: String(call._id) })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      call: {
        ...call,
        id: String(call._id),
        mentorName,
        menteeName: mentee?.name || 'Mentee',
        menteeStandard: mentee?.standard || '',
      },
      processingJob: job
        ? {
            id: String(job._id),
            stage: job.stage,
            status: job.status,
            progress: job.progress,
            stageStatus: job.stageStatus,
            error: job.error,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load call';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 6. GET /api/calls/:id/audio-url — Presigned GET URL (Strictly Mentors/Admins)
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/audio-url', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Mentee access is restricted by default (Phase 1.10)
    if (req.user?.role === 'MENTEE') {
      return res.status(403).json({ message: 'Access denied: Mentees do not have access to call recording audio.' });
    }

    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      const isCaller = allowedIds.includes(call.mentorId);
      const isAssigned = mentorProfile
        ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId: call.menteeId, status: 'active' }).lean()
        : null;
      if (!isCaller && !isAssigned) {
        return res.status(403).json({ message: 'Access denied: You are not authorized to access this call recording.' });
      }
    }

    const storageKey = call.recording?.storageKey || call.recordingUrl;
    if (!storageKey) {
      return res.status(404).json({ message: 'No audio recording file is attached to this call record.' });
    }

    const storageProvider = createStorageProvider();
    const expiresIn = 3600; // 1 hour
    const audioUrl = await storageProvider.getSignedUrl(storageKey, expiresIn);

    // Audit log PLAY_RECORDING
    const mentee = await Mentee.findById(call.menteeId).lean();
    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'PLAY_RECORDING',
      targetType: 'CALL',
      targetId: String(call._id),
      menteeName: mentee?.name,
      details: `Generated secure audio playback URL for call on ${new Date(call.date).toLocaleDateString()}`,
      ipAddress: req.ip,
    });

    return res.json({ audioUrl, expiresIn });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate audio playback URL';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/calls/:id/audio — Audio playback endpoint
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/audio', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role === 'MENTEE') {
      return res.status(403).json({ message: 'Access denied: Mentees do not have access to call recording audio.' });
    }

    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      const isCaller = allowedIds.includes(call.mentorId);
      const isAssigned = mentorProfile
        ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId: call.menteeId, status: 'active' }).lean()
        : null;
      if (!isCaller && !isAssigned) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    const storageKey = call.recording?.storageKey || call.recordingUrl;
    if (!storageKey) {
      return res.status(404).json({ message: 'No recording audio file found.' });
    }

    const storageProvider = createStorageProvider();

    // In S3 mode, redirect to presigned GET URL
    if (storageProvider instanceof S3StorageProvider) {
      const signedUrl = await storageProvider.getSignedUrl(storageKey, 3600);
      return res.redirect(signedUrl);
    }

    // Local / Mock file stream check
    const localPath = storageProvider.getFilePath?.(storageKey);
    if (localPath && fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(localPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': call.recording?.mimeType || 'audio/mpeg',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': call.recording?.mimeType || 'audio/mpeg',
        };
        res.writeHead(200, head);
        fs.createReadStream(localPath).pipe(res);
      }
      return;
    }

    return res.status(404).json({ message: 'Audio file not found on storage server.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to play recording';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 8. GET /api/calls/:id/transcript — Secure transcript view (Mentor/Admin)
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/transcript', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Mentees restricted by default (Phase 1.10)
    if (req.user?.role === 'MENTEE') {
      return res.status(403).json({ message: 'Access denied: Mentees do not have access to call transcripts.' });
    }

    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      const isCaller = allowedIds.includes(call.mentorId);
      const isAssigned = mentorProfile
        ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId: call.menteeId, status: 'active' }).lean()
        : null;
      if (!isCaller && !isAssigned) {
        return res.status(403).json({ message: 'Access denied: You are not authorized to view this transcript.' });
      }
    }

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'VIEW_TRANSCRIPT',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Viewed call transcript',
      ipAddress: req.ip,
    });

    return res.json({
      callId: String(call._id),
      transcript: call.transcription?.text || call.transcript || '',
      segments: call.transcription?.segments ?? [],
      language: call.transcription?.language ?? 'en',
      duration: call.transcription?.duration ?? call.duration,
      status: call.transcription?.status ?? 'PENDING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load transcript';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 9. POST /api/calls/:id/retry — Retry failed processing job
// ──────────────────────────────────────────────────────────────────────────
router.post('/:id/retry', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors and administrators can retry call processing.' });
    }

    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    // Authorization
    if (req.user.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      if (!allowedIds.includes(call.mentorId)) {
        return res.status(403).json({ message: 'Access denied: You can only retry processing for your own calls.' });
      }
    }

    // Duplicate simultaneous processing prevention
    const existingJob = await CallProcessingJob.findOne({ callId: req.params.id }).sort({ createdAt: -1 });
    if (existingJob && existingJob.status === 'PROCESSING') {
      return res.status(409).json({ message: 'Processing is already currently in progress for this call.' });
    }

    // Determine if transcription already succeeded (preserve transcript)
    const skipTranscription = Boolean(
      call.transcription?.status === 'COMPLETED' && (call.transcription?.text || call.transcript),
    );

    // Create a new retry job
    const newJob = await CallProcessingJob.create({
      callId: String(call._id),
      stage: skipTranscription ? 'SUMMARY' : 'TRANSCRIPTION',
      status: 'PROCESSING',
      progress: skipTranscription ? 50 : 10,
      stageStatus: {
        upload: 'COMPLETED',
        audioProcessing: skipTranscription ? 'COMPLETED' : 'PROCESSING',
        transcription: skipTranscription ? 'COMPLETED' : 'PENDING',
        summary: 'PENDING',
        mentorReview: 'PENDING',
      },
      startedAt: new Date(),
    });

    // Reset call status
    await Call.findByIdAndUpdate(req.params.id, {
      $set: {
        recordingStatus: 'processing',
        aiStatus: 'processing',
        ...(skipTranscription ? {} : { 'transcription.status': 'PROCESSING' }),
        'aiSummary.status': 'PENDING',
      },
    });

    // Enqueue job to BullMQ
    await enqueueCallProcessingJob({
      callId: String(call._id),
      jobId: String(newJob._id),
      mentorNotes: call.mentorNotes,
      skipTranscription,
    });

    logAuditEvent({
      userId: req.user.id,
      userName: req.user.email,
      userRole: req.user.role,
      action: 'PROCESSING_RETRIED',
      targetType: 'CALL',
      targetId: String(call._id),
      details: `Retried background processing (skipTranscription=${skipTranscription})`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      message: 'Processing retried successfully.',
      jobId: String(newJob._id),
      status: 'PROCESSING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retry call processing';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 10. GET /api/calls/:id/job — Poll job status
// Always returns fresh state — never cached by browser or CDN
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/job', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Prevent all HTTP caching so the frontend always gets the latest job state
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const job = await CallProcessingJob.findOne({ callId: req.params.id }).sort({ createdAt: -1 }).lean();

    if (!job) {
      return res.status(404).json({ message: 'No processing job found for this call.' });
    }

    return res.json({
      jobId: String(job._id),
      callId: job.callId,
      stage: job.stage,
      status: job.status,
      progress: job.progress,
      stageStatus: job.stageStatus,
      error: job.error ?? null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch job status';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 11. POST /api/calls/:id/approve — Mentor approves summary
// ──────────────────────────────────────────────────────────────────────────
router.post('/:id/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors and administrators can approve call summaries.' });
    }

    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (req.user.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      if (!allowedIds.includes(call.mentorId)) {
        return res.status(403).json({ message: 'Access denied: You can only approve your own call summaries.' });
      }
    }

    const editedSummary = req.body.summary;
    const currentVersion = call.summaryVersions?.length ?? 0;
    const versionEntry = {
      version: currentVersion + 1,
      type: 'APPROVED' as const,
      content: editedSummary ?? call.aiSummary,
      timestamp: new Date(),
      author: req.user.id,
    };

    const updates: Record<string, unknown> = {
      reviewStatus: 'Approved',
      'mentorReview.status': 'Approved',
      'mentorReview.reviewedAt': new Date(),
      'mentorReview.reviewedBy': req.user.id,
    };

    if (editedSummary) {
      updates.summary = editedSummary.shortSummary ?? call.summary;
      if (Array.isArray(editedSummary.keyDiscussionPoints)) updates.keyDiscussionPoints = editedSummary.keyDiscussionPoints;
      if (Array.isArray(editedSummary.actionItems)) updates.actionItems = editedSummary.actionItems;
      if (Array.isArray(editedSummary.followUpRecommendations)) updates.followUpRecommendations = editedSummary.followUpRecommendations;
      updates['aiSummary.shortSummary'] = editedSummary.shortSummary ?? call.aiSummary?.shortSummary;
    }

    await Call.findByIdAndUpdate(req.params.id, {
      $set: updates,
      $push: { summaryVersions: versionEntry },
    });

    await CallProcessingJob.findOneAndUpdate(
      { callId: req.params.id },
      { $set: { 'stageStatus.mentorReview': 'APPROVED' } },
      { sort: { createdAt: -1 } },
    );

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'SUMMARY_APPROVED',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Approved AI summary and finalized official call record',
      ipAddress: req.ip,
    });

    return res.json({ message: 'Summary approved successfully.', reviewStatus: 'Approved' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to approve summary';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 12. PATCH /api/calls/:id — Mentor edits summary
// ──────────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      if (!allowedIds.includes(call.mentorId)) {
        return res.status(403).json({ message: 'Access denied: You can only edit your own calls.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const updates: Record<string, unknown> = {};

    if (req.body.summary) updates.summary = req.body.summary;
    if (req.body.mentorNotes !== undefined) updates.mentorNotes = req.body.mentorNotes;
    if (Array.isArray(req.body.keyDiscussionPoints)) updates.keyDiscussionPoints = req.body.keyDiscussionPoints;
    if (Array.isArray(req.body.studentConcerns)) updates.studentConcerns = req.body.studentConcerns;
    if (Array.isArray(req.body.actionItems)) updates.actionItems = req.body.actionItems;
    if (Array.isArray(req.body.followUpRecommendations)) updates.followUpRecommendations = req.body.followUpRecommendations;
    if (Array.isArray(req.body.topicsDiscussed)) updates.topicsDiscussed = req.body.topicsDiscussed;
    if (req.body.reviewStatus) updates.reviewStatus = req.body.reviewStatus;

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'SUMMARY_EDITED',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Edited mentorship call summary fields',
      ipAddress: req.ip,
    });

    if (req.body.aiSummary) {
      const s = req.body.aiSummary as Record<string, unknown>;
      for (const [k, v] of Object.entries(s)) {
        updates[`aiSummary.${k}`] = v;
      }

      const currentVersion = call.summaryVersions?.length ?? 0;
      await Call.findByIdAndUpdate(req.params.id, {
        $set: updates,
        $push: {
          summaryVersions: {
            version: currentVersion + 1,
            type: 'MENTOR_EDIT',
            content: req.body.aiSummary,
            timestamp: new Date(),
            author: req.user?.id ?? 'unknown',
          },
        },
      });

      const updated = await Call.findById(req.params.id);
      return res.json({ message: 'Call updated successfully.', call: updated });
    }

    const updated = await Call.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    return res.json({ message: 'Call updated successfully.', call: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update call';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 13. DELETE /api/calls/:id — Safe deletion (DB + S3 object)
// ──────────────────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    // Authorization
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      if (!allowedIds.includes(call.mentorId)) {
        return res.status(403).json({ message: 'Access denied: You can only delete your own calls.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Safe S3 deletion: retrieve storageKey
    const storageKey = call.recording?.storageKey;
    if (storageKey) {
      try {
        const storageProvider = createStorageProvider();
        await storageProvider.deleteFile(storageKey);
      } catch (storageError) {
        // Safe S3 deletion failure handling: Log warning but proceed with DB cleanup
        console.warn(`[CallRoutes] Failed to delete S3 file for key "${storageKey}":`, storageError instanceof Error ? storageError.message : storageError);
      }
    }

    // Delete Call and processing jobs from DB
    await Call.findByIdAndDelete(req.params.id);
    await CallProcessingJob.deleteMany({ callId: req.params.id });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'CALL_DELETED',
      targetType: 'CALL',
      targetId: String(call._id),
      details: `Deleted call record and S3 recording (storageKey: ${storageKey || 'none'})`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Call record and recording deleted successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete call';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 14. Mock storage helpers for local development
// ──────────────────────────────────────────────────────────────────────────
router.put('/mock-upload/:key(*)', expressRawMiddleware(), async (req: any, res: Response) => {
  try {
    const rawKey = req.params[0] || (req.params as Record<string, string>)['key'] || '';
    const key = decodeURIComponent(rawKey);
    const uploadsDir = path.resolve(process.cwd(), 'uploads', 'recordings');
    const cleanBasename = path.basename(key);
    const filePath = path.join(uploadsDir, cleanBasename);

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, req.body);
    return res.status(200).send('Uploaded');
  } catch (err) {
    return res.status(500).send('Failed to upload mock file');
  }
});

router.get('/mock-audio/:key(*)', async (req: any, res: Response) => {
  try {
    const rawKey = req.params[0] || (req.params as Record<string, string>)['key'] || '';
    const key = decodeURIComponent(rawKey);
    const cleanBasename = path.basename(key);
    const filePath = path.resolve(process.cwd(), 'uploads', 'recordings', cleanBasename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Not found');
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    return fs.createReadStream(filePath).pipe(res);
  } catch {
    return res.status(500).send('Playback error');
  }
});

function expressRawMiddleware() {
  return (req: any, _res: any, next: any) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      req.body = Buffer.concat(chunks);
      next();
    });
  };
}

export default router;
