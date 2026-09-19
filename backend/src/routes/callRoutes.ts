import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { Mentor } from '../models/Mentor.js';
import { createAiSummaryService } from '../services/aiSummaryService.js';
import { createStorageProvider } from '../services/storageService.js';
import { createTranscriptionService } from '../services/transcriptionService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

const uploadCallSchema = z.object({
  mentorId: z.string().min(1),
  menteeId: z.string().min(1),
  duration: z.number().min(1),
  date: z.string().optional(),
  mentorNotes: z.string().optional(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let filter = {};
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id });
      const ids = [req.user.id, ...(mentorProfile ? [String(mentorProfile._id)] : [])];
      filter = { mentorId: { $in: ids } };
    }
    const calls = await Call.find(filter).sort({ date: -1 }).lean();

    return res.json({
      calls: calls.map((call) => ({
        id: String(call._id),
        mentorId: call.mentorId,
        menteeId: call.menteeId,
        date: call.date,
        duration: call.duration,
        status: call.reviewStatus,
        summary: call.summary ?? 'No summary yet.',
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load calls';
    return res.status(500).json({ message });
  }
});

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
      return res.status(400).json({ message: 'Please provide a valid menteeId and duration.' });
    }

    const storageProvider = createStorageProvider();
    let recordingUrl: string | undefined;

    if (req.file) {
      const uploadResult = await storageProvider.uploadFile({
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      });
      recordingUrl = uploadResult.url;
    }

    const transcriptionService = createTranscriptionService();
    const aiSummaryService = createAiSummaryService();

    let transcriptText = '';
    let summaryResult;

    if (req.file) {
      const transcriptResult = await transcriptionService.transcribe({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      });
      transcriptText = transcriptResult.transcript;
    }

    summaryResult = await aiSummaryService.summarize({
      transcript: transcriptText,
      mentorNotes: parsed.data.mentorNotes,
    });

    const call = await Call.create({
      ...parsed.data,
      mentorId,
      duration: parsed.data.duration,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      recordingUrl,
      transcript: transcriptText,
      summary: summaryResult.shortSummary,
      keyDiscussionPoints: summaryResult.keyDiscussionPoints,
      studentConcerns: summaryResult.studentConcerns,
      actionItems: summaryResult.actionItems,
      followUpRecommendations: summaryResult.followUpRecommendations,
      topicsDiscussed: summaryResult.topicsDiscussed,
      recordingStatus: recordingUrl ? 'uploaded' : 'pending',
      reviewStatus: 'Pending Review',
      aiStatus: transcriptText || parsed.data.mentorNotes ? 'completed' : 'pending',
      mentorNotes: parsed.data.mentorNotes ?? '',
    });

    return res.status(202).json({
      message: 'Upload accepted. AI processing completed.',
      processingStatus: 'Processing',
      callId: String(call._id),
      recordingUrl,
      transcript: transcriptText,
      summary: summaryResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload call';
    return res.status(500).json({ message });
  }
});

// PATCH /api/calls/:id — update call details/edits by mentor
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    const updates: Partial<any> = {};
    if (req.body.summary) updates.summary = req.body.summary;
    if (Array.isArray(req.body.keyDiscussionPoints)) updates.keyDiscussionPoints = req.body.keyDiscussionPoints;
    if (Array.isArray(req.body.studentConcerns)) updates.studentConcerns = req.body.studentConcerns;
    if (Array.isArray(req.body.actionItems)) updates.actionItems = req.body.actionItems;
    if (Array.isArray(req.body.followUpRecommendations)) updates.followUpRecommendations = req.body.followUpRecommendations;
    if (Array.isArray(req.body.topicsDiscussed)) updates.topicsDiscussed = req.body.topicsDiscussed;
    if (req.body.reviewStatus) updates.reviewStatus = req.body.reviewStatus;

    const updated = await Call.findByIdAndUpdate(req.params.id, updates, { new: true });
    return res.json({ message: 'Call updated successfully.', call: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update call';
    return res.status(500).json({ message });
  }
});

export default router;
