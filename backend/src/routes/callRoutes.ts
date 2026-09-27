import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { User } from '../models/User.js';
import { createStorageProvider, S3StorageProvider } from '../services/storageService.js';
import { runCallProcessingPipeline } from '../services/callProcessingService.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

// ─── Multer — up to 100 MB ─────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm', 'audio/x-m4a', 'audio/aac'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a|mp4|webm|ogg|aac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── Schema ────────────────────────────────────────────────────────────────
const uploadCallSchema = z.object({
  mentorId: z.string().min(1),
  menteeId: z.string().min(1),
  duration: z.number().min(1),
  date: z.string().optional(),
  mentorNotes: z.string().optional(),
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/calls  — list calls visible to the current user
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

    // Cache mentor and mentee names
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
          processingProgress: null,
          hasRecording: Boolean(call.recordingUrl || call.recording?.url),
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
// GET /api/calls/:id  — full call detail
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    // Authorisation: mentor for this call, or admin, or assigned mentor
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

    // Attach mentor and mentee details
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

    // Attach latest job info
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
// POST /api/calls/upload  — upload recording, kick off background pipeline
// ──────────────────────────────────────────────────────────────────────────
router.post('/upload', requireAuth, upload.single('recording'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR') {
      return res.status(403).json({ message: 'Only mentors can upload call records.' });
    }

    const mentorProfile = await Mentor.findOne({ userId: req.user.id });
    const mentorId = mentorProfile ? String(mentorProfile._id) : req.user.id;

    const rawBody = {
      mentorId: req.body.mentorId ?? mentorId,
      menteeId: req.body.menteeId,
      duration: req.body.duration ? Number(req.body.duration) : undefined,
      date: req.body.date,
      mentorNotes: req.body.mentorNotes,
    };

    const parsed = uploadCallSchema.safeParse(rawBody);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a valid menteeId and duration.', errors: parsed.error.issues });
    }

    // ── Store the raw recording ──────────────────────────────────────────
    const storageProvider = createStorageProvider();
    let recordingUrl: string | undefined;
    let fileName: string | undefined;

    if (req.file) {
      const uploadResult = await storageProvider.uploadFile({
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      });
      recordingUrl = uploadResult.url;
      fileName = req.file.originalname;
    }

    // ── Create the Call document ─────────────────────────────────────────
    const call = await Call.create({
      ...parsed.data,
      mentorId,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      recordingUrl,
      recording: recordingUrl
        ? {
            url: recordingUrl,
            fileName,
            fileSize: req.file?.size,
            mimeType: req.file?.mimetype,
          }
        : undefined,
      recordingStatus: recordingUrl ? 'uploaded' : 'pending',
      reviewStatus: 'Draft',
      aiStatus: 'pending',
      'transcription.status': 'PENDING',
      'aiSummary.status': 'PENDING',
      mentorNotes: parsed.data.mentorNotes ?? '',
    });

    // ── Create the processing job ────────────────────────────────────────
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

    // ── Fire-and-forget background pipeline ─────────────────────────────
    // Keep a copy of the buffer before Multer clears it
    const fileBuffer = req.file?.buffer ? Buffer.from(req.file.buffer) : undefined;
    const originalname = req.file?.originalname;
    const mimetype = req.file?.mimetype;
    const mentorNotes = parsed.data.mentorNotes;

    // Run asynchronously — do NOT await
    runCallProcessingPipeline(String(job._id), String(call._id), fileBuffer, originalname, mimetype, mentorNotes).catch((err) => {
      console.error('[CallRoutes] Pipeline error (unhandled):', err);
    });

    // ── Audit log ────────────────────────────────────────────────────────
    const menteeDoc = await Mentee.findById(parsed.data.menteeId).lean();
    logAuditEvent({
      userId: req.user.id,
      userName: req.user.email,
      userRole: req.user.role,
      action: 'UPLOAD_RECORDING',
      targetType: 'CALL',
      targetId: String(call._id),
      menteeName: menteeDoc?.name,
      details: `Uploaded call record for ${menteeDoc?.name || 'mentee'} (${parsed.data.duration} mins)`,
      ipAddress: req.ip,
    });

    return res.status(202).json({
      message: 'Upload accepted. AI processing has started.',
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
// GET /api/calls/:id/job  — poll pipeline progress
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/job', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
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
// GET /api/calls/:id/audio  — secure authenticated audio stream with range support
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/audio', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    // Authorization checks
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      const isCaller = allowedIds.includes(call.mentorId);
      const isAssigned = mentorProfile
        ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId: call.menteeId, status: 'active' }).lean()
        : null;
      if (!isCaller && !isAssigned) {
        return res.status(403).json({ message: 'Access denied: You are not authorized to listen to this call.' });
      }
    } else if (req.user?.role === 'MENTEE') {
      const menteeIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      if (!menteeIds.includes(call.menteeId)) {
        return res.status(403).json({ message: 'Access denied: You can only access your own call recordings.' });
      }
    }

    const mentee = await Mentee.findById(call.menteeId).lean();

    // Log audit event for recording access
    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'PLAY_RECORDING',
      targetType: 'CALL',
      targetId: String(call._id),
      menteeName: mentee?.name,
      details: `Played call recording from ${new Date(call.date).toLocaleDateString('en-IN')}`,
      ipAddress: req.ip,
    });

    const storageProvider = createStorageProvider();

    // If S3, generate temporary signed URL and redirect
    if (storageProvider instanceof S3StorageProvider && storageProvider.getSignedUrl && call.recording?.fileName) {
      const signedUrl = await storageProvider.getSignedUrl(call.recording.fileName);
      return res.redirect(signedUrl);
    }

    // Local / Mock file stream check
    const localKey = call.recording?.fileName || call.recordingUrl;
    const localPath = localKey ? (storageProvider as any).getFilePath?.(localKey) : null;

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

    // If no physical audio file was uploaded (e.g. notes only)
    return res.status(404).json({ message: 'Recording audio file is not available on storage server.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to play recording';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/calls/:id/transcript  — view the full transcript with segments
// ──────────────────────────────────────────────────────────────────────────
router.get('/:id/transcript', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    // Authorization checks
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
    } else if (req.user?.role === 'MENTEE') {
      const menteeIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      if (!menteeIds.includes(call.menteeId)) {
        return res.status(403).json({ message: 'Access denied: You can only view your own transcripts.' });
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
// POST /api/calls/:id/approve  — mentor approves the AI summary
// ──────────────────────────────────────────────────────────────────────────
router.post('/:id/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR') {
      return res.status(403).json({ message: 'Only mentors can approve summaries.' });
    }

    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    const mentorProfile = await Mentor.findOne({ userId: req.user.id });
    const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
    if (!allowedIds.includes(call.mentorId)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const editedSummary = req.body.summary; // optional edited summary object

    // Push an APPROVED version entry
    const currentVersion = call.summaryVersions?.length ?? 0;
    const versionEntry = {
      version: currentVersion + 1,
      type: 'APPROVED',
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

    // If the mentor submitted edits, apply them
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

    // Update job
    await CallProcessingJob.findOneAndUpdate(
      { callId: req.params.id },
      { $set: { 'stageStatus.mentorReview': 'APPROVED' } },
      { sort: { createdAt: -1 } },
    );

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'APPROVE_SUMMARY',
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
// PATCH /api/calls/:id  — general update (mentor edit before approval)
// ──────────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    // Authorization check
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

    // Flat fields
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
      action: 'EDIT_SUMMARY',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Edited mentorship call summary fields',
      ipAddress: req.ip,
    });

    // Structured aiSummary patch
    if (req.body.aiSummary) {
      const s = req.body.aiSummary as Record<string, unknown>;
      for (const [k, v] of Object.entries(s)) {
        updates[`aiSummary.${k}`] = v;
      }

      // Push a MENTOR_EDIT version
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
// DELETE /api/calls/:id  — delete call record (Admin or Mentor caller)
// ──────────────────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    // Authorization: Admin or the Mentor who owns the call
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const allowedIds = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      if (!allowedIds.includes(call.mentorId)) {
        return res.status(403).json({ message: 'Access denied: You can only delete your own calls.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    await Call.findByIdAndDelete(req.params.id);

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email,
      userRole: req.user!.role,
      action: 'DELETE_RECORD',
      targetType: 'CALL',
      targetId: String(call._id),
      details: `Deleted call record for session on ${new Date(call.date).toLocaleDateString()}`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Call record deleted successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete call';
    return res.status(500).json({ message });
  }
});

export default router;
