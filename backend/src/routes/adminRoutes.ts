import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { getDashboardSummary } from '../services/dashboardService.js';
import { createStorageProvider } from '../services/storageService.js';
import { summarizeAssignments } from '../services/mentorshipService.js';
import { logAuditEvent } from '../services/auditService.js';
import { removeCallProcessingJob } from '../queue/callQueue.js';
import { createNotification } from '../services/notificationService.js';
import { maskDeletedCallParts } from '../services/callVisibility.js';

const createAssignmentSchema = z.object({
  mentorId: z.string().min(1),
  menteeId: z.string().min(1),
  status: z.enum(['active', 'archived']).optional(),
});

const router = Router();

const binModels = {
  users: User,
  mentors: Mentor,
  mentees: Mentee,
  mentorships: Mentorship,
  calls: Call,
  dailyPerformance: DailyPerformance,
} as const;
const binCollections = {
  announcements: 'announcements',
  proxyAssignments: 'proxyAssignments',
  conversations: 'conversations',
} as const;

// Soft-deleted records remain in MongoDB and can be restored by an administrator.
router.get('/bin', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const modelEntries = await Promise.all(Object.entries(binModels).map(async ([type, Model]) => {
      const records = await (Model as any).find({ deletedAt: { $ne: null } })
        .setOptions({ includeDeleted: true })
        .sort({ deletedAt: -1 })
        .limit(500)
        .lean();
      return (records as any[]).map((record: any) => ({
        type,
        id: String(record._id),
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy,
        deletionReason: record.deletionReason,
        label: record.name || record.email || record.title || record.date || `${type} record`,
      }));
    }));
    const collectionEntries = await Promise.all(Object.entries(binCollections).map(async ([type, name]) => {
      const records = await mongoose.connection.collection(name).find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(500).toArray();
      return records.map((record) => ({
        type,
        id: String(record._id),
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy,
        deletionReason: record.deletionReason,
        label: record.title || record.lastMessage || `${type} record`,
      }));
    }));
    const partEntries = await Call.find({ $or: [{ recordingDeletedAt: { $ne: null } }, { summaryDeletedAt: { $ne: null } }, { intelligenceDeletedAt: { $ne: null } }] }).setOptions({ includeDeleted: true }).select('_id recordingDeletedAt summaryDeletedAt intelligenceDeletedAt').lean();
    const callPartEntries = partEntries.flatMap((call) => [
      call.recordingDeletedAt ? { type: 'callRecording', id: String(call._id), deletedAt: call.recordingDeletedAt, label: 'Call recording', deletionReason: 'Recording hidden by administrator' } : null,
      call.summaryDeletedAt ? { type: 'callSummary', id: String(call._id), deletedAt: call.summaryDeletedAt, label: 'Call summary', deletionReason: 'Summary hidden by administrator' } : null,
      call.intelligenceDeletedAt ? { type: 'callIntelligence', id: String(call._id), deletedAt: call.intelligenceDeletedAt, label: 'AI intelligence', deletionReason: 'AI intelligence hidden by administrator' } : null,
    ].filter((entry): entry is { type: string; id: string; deletedAt: Date; label: string; deletionReason: string } => Boolean(entry)));
    const menteeNotes = await Mentee.find({ 'notes.deletedAt': { $ne: null } }).setOptions({ includeDeleted: true }).select('_id notes').lean();
    const noteEntries = menteeNotes.flatMap((mentee) => (Array.isArray(mentee.notes) ? mentee.notes : []).filter((note: any) => note.deletedAt).map((note: any) => ({ type: 'menteeNote', id: String(note.id), deletedAt: note.deletedAt, deletedBy: note.deletedBy, deletionReason: note.deletionReason, label: String(note.title || note.content || 'Mentee note').slice(0, 120) })));
    const entries = [...modelEntries.flat(), ...collectionEntries.flat(), ...callPartEntries, ...noteEntries];
    return res.json({ items: entries.sort((a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime()) });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load Bin.' });
  }
});

router.post('/bin/:type/:id/restore', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const binType = String(req.params.type);
    const recordId = String(req.params.id);
    const Model = binModels[binType as keyof typeof binModels] as any;
    if (['callRecording', 'callSummary', 'callIntelligence'].includes(binType)) {
      const flag = binType === 'callRecording' ? 'recordingDeletedAt' : binType === 'callSummary' ? 'summaryDeletedAt' : 'intelligenceDeletedAt';
      const restoredPart = await Call.findByIdAndUpdate(recordId, { $unset: { [flag]: 1, ...(flag === 'recordingDeletedAt' ? { recordingDeletionReason: 1 } : {}) } }, { new: true }).setOptions({ includeDeleted: true }).lean();
      if (!restoredPart) return res.status(404).json({ message: 'Deleted call item not found.' });
      await logAuditEvent({ userId: req.user!.id, userName: req.user!.email || 'Admin', userRole: 'ADMIN', action: 'RESTORE_RECORD', targetType: 'CALL', targetId: recordId, details: 'Administrator restored a call item from Bin.', ipAddress: req.ip });
      return res.json({ record: restoredPart });
    }
    if (binType === 'menteeNote') {
      const restoredNote = await Mentee.findOneAndUpdate(
        { 'notes.id': recordId },
        { $set: { 'notes.$[note].deletedAt': null }, $unset: { 'notes.$[note].deletedBy': 1, 'notes.$[note].deletionReason': 1 } },
        { new: true, arrayFilters: [{ 'note.id': recordId }] },
      ).setOptions({ includeDeleted: true }).lean();
      if (!restoredNote) return res.status(404).json({ message: 'Deleted mentee note not found.' });
      await logAuditEvent({ userId: req.user!.id, userName: req.user!.email || 'Admin', userRole: 'ADMIN', action: 'RESTORE_RECORD', targetType: 'MENTEE_NOTE', targetId: recordId, details: 'Administrator restored a mentee note from Bin.', ipAddress: req.ip });
      return res.json({ record: restoredNote });
    }
    const rawCollection = binCollections[binType as keyof typeof binCollections];
    if (rawCollection) {
      if (!mongoose.isValidObjectId(recordId)) {
        return res.status(400).json({ message: 'Invalid Bin record ID.' });
      }
      const restoredRaw = await mongoose.connection.collection(rawCollection).findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(recordId), deletedAt: { $ne: null } },
        { $set: { deletedAt: null }, $unset: { deletedBy: 1, deletionReason: 1 } },
        { returnDocument: 'after' },
      );
      if (!restoredRaw) return res.status(404).json({ message: 'Deleted record not found.' });
      const targetType = binType === 'announcements' ? 'ANNOUNCEMENT' : binType === 'proxyAssignments' ? 'PROXY_ASSIGNMENT' : 'CONVERSATION';
      await logAuditEvent({ userId: req.user!.id, userName: req.user!.email || 'Admin', userRole: 'ADMIN', action: 'RESTORE_RECORD', targetType, targetId: recordId, details: 'Administrator restored a raw record from Bin.', ipAddress: req.ip });
      return res.json({ record: restoredRaw });
    }
    if (!Model) return res.status(400).json({ message: 'Invalid Bin record type.' });
    const restored = await Model.findByIdAndUpdate(
      recordId,
      { $set: { deletedAt: null }, $unset: { deletedBy: 1, deletionReason: 1 } },
      { new: true },
    ).setOptions({ includeDeleted: true }).lean();
    if (!restored) return res.status(404).json({ message: 'Deleted record not found.' });
    await logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'RESTORE_RECORD',
      targetType: binType === 'mentors' ? 'MENTOR' : binType === 'mentees' ? 'MENTEE' : binType === 'mentorships' ? 'MENTORSHIP' : binType === 'dailyPerformance' ? 'DAILY_PERFORMANCE' : 'USER',
      targetId: recordId,
      details: 'Administrator restored a record from Bin.',
      ipAddress: req.ip,
    });
    return res.json({ record: restored });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unable to restore record.' });
  }
});

async function softDeleteRaw(collectionName: string, id: string, user: AuthRequest['user'], res: Response) {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid record ID.' });
  const result = await mongoose.connection.collection(collectionName).findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: user!.id, deletionReason: 'Deleted by administrator' } },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ message: 'Record not found.' });
  return res.json({ message: 'Record moved to Bin.', record: result });
}

router.delete('/announcements/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => softDeleteRaw('announcements', String(req.params.id), req.user, res));
router.delete('/proxy-assignments/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => softDeleteRaw('proxyAssignments', String(req.params.id), req.user, res));
router.delete('/conversations/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => softDeleteRaw('conversations', String(req.params.id), req.user, res));

const reviewUpdateSchema = z.object({
  reviewStatus: z.enum(['Pending Review', 'Approved', 'Rejected']),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters long.'),
});

router.post('/users/:userId/reset-password', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Password must be at least 12 characters long.' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    user.status = 'active';
    await user.save();

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'PASSWORD_RESET',
      targetType: 'USER',
      targetId: String(user._id),
      details: 'Administrator reset the user password.',
      ipAddress: req.ip,
    });

    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset password';
    return res.status(500).json({ message });
  }
});

router.get('/dashboard-summary', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getDashboardSummary();
    return res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard summary';
    return res.status(500).json({ message });
  }
});

router.get('/analytics-summary', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const [counts, duration, topics] = await Promise.all([
      Call.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$reviewStatus', count: { $sum: 1 } } },
      ]),
      Call.aggregate<{ _id: null; totalCalls: number; averageDuration: number }>([
        { $group: { _id: null, totalCalls: { $sum: 1 }, averageDuration: { $avg: { $ifNull: ['$duration', 0] } } } },
      ]),
      Call.aggregate<{ _id: string; count: number }>([
        { $unwind: '$topicsDiscussed' },
        { $group: { _id: '$topicsDiscussed', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);
    const countMap = new Map(counts.map((entry) => [entry._id, entry.count]));
    const totalCalls = duration[0]?.totalCalls ?? 0;
    const approvedCalls = countMap.get('Approved') ?? 0;
    const rejectedCalls = countMap.get('Rejected') ?? 0;
    const pendingCalls = countMap.get('Pending Review') ?? 0;
    const averageDuration = duration[0]?.averageDuration ?? 0;
    const topTopics = topics.map((topic) => ({ name: topic._id, count: topic.count }));

    return res.json({
      totalCalls,
      approvedCalls,
      rejectedCalls,
      pendingCalls,
      averageDurationMinutes: Number(averageDuration.toFixed(1)),
      approvalRate: totalCalls > 0 ? Number(((approvedCalls / totalCalls) * 100).toFixed(1)) : 0,
      topTopics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch analytics summary';
    return res.status(500).json({ message });
  }
});

router.get('/mentorship-summary', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const assignments = await Mentorship.find().lean();
    const menteeIds = [...new Set(assignments.map((assignment) => assignment.menteeId))];
    const mentorIds = [...new Set(assignments.map((assignment) => assignment.mentorId))];

    const mentees = await Mentee.find({ _id: { $in: menteeIds } }, { name: 1 }).lean();
    const mentors = await Mentor.find({ _id: { $in: mentorIds } }).lean();
    const users = await User.find({ _id: { $in: mentors.map((mentor) => mentor.userId) } }, { _id: 1, name: 1 }).lean();

    const menteeMap = new Map(mentees.map((mentee) => [String(mentee._id), mentee.name]));
    const mentorUserMap = new Map(users.map((user) => [String(user._id), user.name]));

    const summaryData = assignments.map((assignment) => {
      const mentorRecord = mentors.find((mentor) => String(mentor._id) === assignment.mentorId);
      const mentorName = mentorRecord ? mentorUserMap.get(mentorRecord.userId) ?? 'Unknown mentor' : 'Unknown mentor';
      return {
        mentorName,
        menteeName: menteeMap.get(assignment.menteeId) ?? 'Unknown mentee',
        status: assignment.status,
      };
    });

    return res.json(summarizeAssignments(summaryData));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentorship summary';
    return res.status(500).json({ message });
  }
});

router.get('/assignments', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const assignments = await Mentorship.find().sort({ assignedAt: -1 }).lean();

    const mentorIds = [...new Set(assignments.map((assignment) => assignment.mentorId))];
    const menteeIds = [...new Set(assignments.map((assignment) => assignment.menteeId))];

    const mentors = await Mentor.find({ _id: { $in: mentorIds } }).lean();
    const users = await User.find({ _id: { $in: mentors.map((mentor) => mentor.userId) } }, { _id: 1, name: 1, email: 1 }).lean();
    const mentees = await Mentee.find({ _id: { $in: menteeIds } }, { _id: 1, name: 1, standard: 1 }).lean();

    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const menteeMap = new Map(mentees.map((mentee) => [String(mentee._id), mentee]));

    return res.json({
      assignments: assignments.map((assignment) => {
        const mentorRecord = mentors.find((mentor) => String(mentor._id) === assignment.mentorId);
        const mentorUser = mentorRecord ? userMap.get(mentorRecord.userId) : undefined;
        const mentee = menteeMap.get(assignment.menteeId);

        return {
          id: String(assignment._id),
          mentorId: assignment.mentorId,
          mentorName: mentorUser?.name ?? 'Unknown mentor',
          mentorEmail: mentorUser?.email ?? 'unknown@anfaal.org',
          menteeId: assignment.menteeId,
          menteeName: mentee?.name ?? 'Unknown mentee',
          menteeStandard: mentee?.standard ?? '—',
          status: assignment.status,
          assignedAt: assignment.assignedAt,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch assignments';
    return res.status(500).json({ message });
  }
});

router.post('/assignments', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a mentorId and menteeId.' });
    }

    const existing = await Mentorship.findOne({ mentorId: parsed.data.mentorId, menteeId: parsed.data.menteeId });
    if (existing) {
      return res.status(409).json({ message: 'This mentor-mentee assignment already exists.' });
    }

    const mentor = await Mentor.findById(parsed.data.mentorId);
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found.' });
    }

    const mentee = await Mentee.findById(parsed.data.menteeId);
    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    const assignment = await Mentorship.create({
      mentorId: parsed.data.mentorId,
      menteeId: parsed.data.menteeId,
      status: parsed.data.status ?? 'active',
    });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'ASSIGNMENT_CHANGED',
      targetType: 'MENTORSHIP',
      targetId: String(assignment._id),
      menteeName: mentee.name,
      details: `Created assignment: Mentee ${mentee.name} to mentor ${parsed.data.mentorId}`,
      ipAddress: req.ip,
    });

    // Notify mentor and mentee asynchronously
    void (async () => {
      try {
        const mentorDoc = await Mentor.findById(parsed.data.mentorId).lean();
        if (mentorDoc?.userId) {
          await createNotification({
            userId: mentorDoc.userId,
            type: 'MENTEE_ASSIGNED',
            category: 'mentorshipActivity',
            title: 'New mentee assigned',
            message: `${mentee.name} has been assigned to you.`,
            link: '/mentor/mentees',
            metadata: { menteeId: String(mentee._id) },
          });
        }
        if (mentee.userId) {
          const mentorUser = mentorDoc?.userId ? await User.findById(mentorDoc.userId).select('name').lean() : null;
          await createNotification({
            userId: mentee.userId,
            type: 'MENTOR_ASSIGNED',
            category: 'mentorshipActivity',
            title: 'Mentor assigned',
            message: `${mentorUser?.name || 'A mentor'} has been assigned to you.`,
            link: '/mentee',
            metadata: { mentorId: parsed.data.mentorId },
          });
        }
      } catch (err) {
        console.error('[AdminRoutes] Error notifying assignment:', err);
      }
    })();

    return res.status(201).json({
      message: 'Assignment created successfully.',
      assignment: {
        id: String(assignment._id),
        mentorId: assignment.mentorId,
        menteeId: assignment.menteeId,
        status: assignment.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create assignment';
    return res.status(500).json({ message });
  }
});

router.patch('/assignments/:assignmentId', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const statusSchema = z.object({ status: z.enum(['active', 'archived']) });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a valid status.' });
    }

    const assignment = await Mentorship.findByIdAndUpdate(req.params.assignmentId, { status: parsed.data.status }, { new: true });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'ASSIGNMENT_CHANGED',
      targetType: 'MENTORSHIP',
      targetId: String(assignment._id),
      details: `Updated assignment status to ${parsed.data.status}`,
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Assignment updated.',
      assignment: {
        id: String(assignment._id),
        status: assignment.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update assignment';
    return res.status(500).json({ message });
  }
});

router.delete('/assignments/:assignmentId', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Mentorship.findByIdAndUpdate(req.params.assignmentId, {
      $set: { deletedAt: new Date(), deletedBy: req.user!.id, deletionReason: 'Removed by administrator' },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'ASSIGNMENT_CHANGED',
      targetType: 'MENTORSHIP',
      targetId: String(req.params.assignmentId),
      details: `Deleted mentorship assignment ${req.params.assignmentId}`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Assignment removed.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete assignment';
    return res.status(500).json({ message });
  }
});

router.get('/calls/pending', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const calls = await Call.find({ reviewStatus: 'Pending Review' }).sort({ createdAt: -1 }).lean();

    return res.json({
      calls: calls.map((rawCall) => {
        const call = maskDeletedCallParts(rawCall);
        return {
        id: String(call._id),
        mentorId: call.mentorId,
        menteeId: call.menteeId,
        date: call.date,
        uploadedAt: call.uploadedAt || call.createdAt || call.date,
        duration: call.duration,
        summary: call.summary,
        recordingUrl: call.recordingUrl,
        reviewStatus: call.reviewStatus,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch review queue';
    return res.status(500).json({ message });
  }
});

router.patch('/calls/:callId/review', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = reviewUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a valid review status.' });
    }

    const call = await Call.findByIdAndUpdate(
      req.params.callId,
      { reviewStatus: parsed.data.reviewStatus },
      { new: true },
    );

    if (!call) {
      return res.status(404).json({ message: 'Call not found.' });
    }

    return res.json({
      message: 'Review updated.',
      call: {
        id: String(call._id),
        reviewStatus: call.reviewStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update review';
    return res.status(500).json({ message });
  }
});

router.get('/calls/:callId/recording-url', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.callId).lean();
    if (!call || call.recordingDeletedAt || !call.recordingUrl) {
      return res.status(404).json({ message: 'Recording not found.' });
    }

    const storageProvider = createStorageProvider();
    const signedUrl = storageProvider.getSignedUrl ? await storageProvider.getSignedUrl(call.recordingUrl.split('/').pop() || call.recordingUrl) : call.recordingUrl;

    return res.json({ url: signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch recording URL';
    return res.status(500).json({ message });
  }
});

// GET /api/admin/reports/calls — export call data as CSV
router.get('/reports/calls', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, mentorId, menteeId, standard, status } = req.query;

    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.date = {
        ...(from ? { $gte: new Date(String(from)) } : {}),
        ...(to ? { $lte: new Date(String(to)) } : {}),
      };
    }
    if (mentorId) filter.mentorId = String(mentorId);
    if (menteeId) filter.menteeId = String(menteeId);
    if (status) filter.reviewStatus = String(status);

    const calls = await Call.find(filter).sort({ date: -1 }).lean();

    // Enrich with names
    const mentorIds = [...new Set(calls.map((c) => c.mentorId))];
    const menteeIds = [...new Set(calls.map((c) => c.menteeId))];

    const mentors = await Mentor.find({ _id: { $in: mentorIds } }).lean();
    const users = await User.find({ _id: { $in: mentors.map((m) => m.userId) } }, { _id: 1, name: 1 }).lean();
    const mentees = await Mentee.find({ _id: { $in: menteeIds } }, { _id: 1, name: 1, standard: 1 }).lean();

    const userMap = new Map(users.map((u) => [String(u._id), u.name]));
    const mentorUserMap = new Map(mentors.map((m) => [String(m._id), userMap.get(m.userId) ?? 'Unknown']));
    const menteeMap = new Map(mentees.map((m) => [String(m._id), { name: m.name, standard: m.standard }]));

    // Filter by standard if provided
    const filteredCalls = standard
      ? calls.filter((c) => menteeMap.get(c.menteeId)?.standard === String(standard))
      : calls;

    const rows = filteredCalls.map((rawCall) => {
      const call = maskDeletedCallParts(rawCall);
      const menteeInfo = menteeMap.get(call.menteeId);
      return {
        mentorName: mentorUserMap.get(call.mentorId) ?? 'Unknown',
        menteeName: menteeInfo?.name ?? 'Unknown',
        standard: menteeInfo?.standard ?? '—',
        date: new Date(call.date).toLocaleDateString('en-IN'),
        duration: call.duration,
        status: call.reviewStatus,
        summary: (call.summary ?? '').replace(/"/g, '""'),
        topics: (call.topicsDiscussed ?? []).join('; '),
        actionItems: (call.actionItems ?? []).join('; '),
      };
    });

    const headers = ['Mentor', 'Mentee', 'Standard', 'Date', 'Duration (min)', 'Status', 'Summary', 'Topics', 'Action Items'];
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          `"${r.mentorName}"`,
          `"${r.menteeName}"`,
          `"${r.standard}"`,
          `"${r.date}"`,
          r.duration,
          `"${r.status}"`,
          `"${r.summary}"`,
          `"${r.topics}"`,
          `"${r.actionItems}"`,
        ].join(','),
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="anfaal-calls-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csvLines.join('\n'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate report';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-logs  — audit log for sensitive operations (Section 16)
// ──────────────────────────────────────────────────────────────────────────
router.get('/audit-logs', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const action = req.query.action as string | undefined;
    const query: Record<string, unknown> = {};
    if (action) query.action = action;

    const { AuditLog } = await import('../models/AuditLog.js');
    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch audit logs';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Helper: Clean up storage & queue resources for a call
// ──────────────────────────────────────────────────────────────────────────
async function cleanupCallResources(call: any): Promise<{ storageDeleted: boolean; storageError?: string }> {
  // Records are soft-deleted now, so recordings must remain available for Bin restore.
  const storageDeleted = false;
  const storageError = 'Recording preserved for Bin restore.';

  // Cancel/remove any queued or processing BullMQ jobs
  try {
    const jobs = await CallProcessingJob.find({ callId: String(call._id) }).select('_id').lean();
    for (const job of jobs) {
      await removeCallProcessingJob(String(job._id)).catch(() => {});
    }
    await removeCallProcessingJob(String(call._id)).catch(() => {});
  } catch (queueErr) {
    console.warn(`[AdminRoutes] Queue cleanup warning for call "${call._id}":`, queueErr);
  }

  // Remove processing job records
  await CallProcessingJob.deleteMany({ callId: String(call._id) }).catch(() => {});

  return { storageDeleted, storageError };
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Please select at least one record to delete.').max(200),
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/calls/:id — Delete entire call & all associated data
// ──────────────────────────────────────────────────────────────────────────
router.delete('/calls/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call record not found.' });

    const { storageDeleted, storageError } = await cleanupCallResources(call);
    await Call.findByIdAndUpdate(req.params.id, {
      $set: { deletedAt: new Date(), deletedBy: req.user!.id, deletionReason: 'Deleted by administrator' },
    });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'CALL_DELETED',
      targetType: 'CALL',
      targetId: String(call._id),
      details: `Administrator deleted complete call record (storage ${storageDeleted ? 'cleaned' : 'warning: ' + storageError})`,
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Call moved to Bin. The database record and recording were preserved.',
      storageDeleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete call';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/calls/:id/recording — Delete call recording only
// ──────────────────────────────────────────────────────────────────────────
router.delete('/calls/:id/recording', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found.' });
    if (!call.recording && !call.recordingUrl) {
      return res.status(400).json({ message: 'No recording file is attached to this call.' });
    }

    const storageDeleted = false;

    await Call.findByIdAndUpdate(req.params.id, {
      $set: { recordingDeletedAt: new Date(), recordingDeletionReason: 'Recording hidden by administrator' },
    });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Administrator deleted audio recording from call.',
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Call recording moved to Bin and preserved.',
      storageDeleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete recording';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/calls/:id/summary — Delete call summary only
// ──────────────────────────────────────────────────────────────────────────
router.delete('/calls/:id/summary', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    await Call.findByIdAndUpdate(req.params.id, { $set: { summaryDeletedAt: new Date() } });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Administrator deleted summary from call.',
      ipAddress: req.ip,
    });

    return res.json({ message: 'Call summary moved to Bin and preserved.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete summary';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/calls/:id/intelligence — Delete call intelligence only
// ──────────────────────────────────────────────────────────────────────────
router.delete('/calls/:id/intelligence', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    await Call.findByIdAndUpdate(req.params.id, { $set: { intelligenceDeletedAt: new Date() } });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'CALL',
      targetId: String(call._id),
      details: 'Administrator deleted AI intelligence analysis from call.',
      ipAddress: req.ip,
    });

    return res.json({ message: 'Call intelligence moved to Bin and preserved.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete intelligence';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/calls/bulk-delete — Bulk delete calls
// ──────────────────────────────────────────────────────────────────────────
router.post('/calls/bulk-delete', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid request body.' });
    }

    const ids = parsed.data.ids;
    const calls = await Call.find({ _id: { $in: ids } });

    const deletedIds: string[] = [];
    const failedIds: string[] = [];
    const errors: string[] = [];

    for (const call of calls) {
      try {
        await cleanupCallResources(call);
        await Call.findByIdAndUpdate(call._id, {
          $set: { deletedAt: new Date(), deletedBy: req.user!.id, deletionReason: 'Bulk deleted by administrator' },
        });
        deletedIds.push(String(call._id));
      } catch (err) {
        failedIds.push(String(call._id));
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Any IDs requested that didn't exist in DB
    const foundIds = new Set(calls.map((c) => String(c._id)));
    for (const id of ids) {
      if (!foundIds.has(id) && !failedIds.includes(id)) {
        failedIds.push(id);
      }
    }

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'CALL_DELETED',
      targetType: 'CALL',
      targetId: 'BULK',
      details: `Administrator bulk deleted ${deletedIds.length} calls (${failedIds.length} failed).`,
      ipAddress: req.ip,
    });

    return res.json({
      message: `${deletedIds.length} ${deletedIds.length === 1 ? 'call' : 'calls'} moved to Bin successfully.${failedIds.length > 0 ? ` (${failedIds.length} could not be moved)` : ''}`,
      deletedCount: deletedIds.length,
      deletedIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to bulk delete calls';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/daily-performance — List all mentee daily performance entries
// ──────────────────────────────────────────────────────────────────────────
router.get('/daily-performance', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { menteeId, from, to, search, limit = '100', skip = '0' } = req.query;
    const filter: Record<string, unknown> = {};

    if (menteeId) filter.menteeId = String(menteeId);
    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, string>).$gte = String(from);
      if (to) (filter.date as Record<string, string>).$lte = String(to);
    }

    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      const matchingMentees = await Mentee.find({
        $or: [{ name: searchRegex }, { makid: searchRegex }],
      }).select('_id').lean();
      const matchingMenteeIds = matchingMentees.map((m) => String(m._id));
      if (!menteeId) {
        filter.$or = [
          { menteeId: { $in: matchingMenteeIds } },
          { dailyReflection: searchRegex },
          { difficultyNote: searchRegex },
          { mentorHelpNote: searchRegex },
        ];
      }
    }

    const [records, totalCount] = await Promise.all([
      DailyPerformance.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      DailyPerformance.countDocuments(filter),
    ]);

    // Enrich with mentee details
    const uniqueMenteeIds = [...new Set(records.map((r) => r.menteeId))];
    const mentees = await Mentee.find({ _id: { $in: uniqueMenteeIds } })
      .select('_id name makid standard')
      .lean();
    const menteeMap = new Map(mentees.map((m) => [String(m._id), m]));

    const enriched = records.map((r) => {
      const menteeInfo = menteeMap.get(r.menteeId);
      return {
        ...r,
        id: String(r._id),
        menteeName: menteeInfo?.name || 'Unknown Mentee',
        menteeMakid: menteeInfo?.makid || '',
        menteeStandard: menteeInfo?.standard || '',
        submittedAt: r.submittedAt || r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return res.json({ records: enriched, totalCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch daily performance records';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/daily-performance/:id — Delete single daily performance record
// ──────────────────────────────────────────────────────────────────────────
router.delete('/daily-performance/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const record = await DailyPerformance.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: 'Daily performance record not found.' });
    }

    await DailyPerformance.findByIdAndUpdate(req.params.id, {
      $set: { deletedAt: new Date(), deletedBy: req.user!.id, deletionReason: 'Deleted by administrator' },
    });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'DAILY_PERFORMANCE',
      targetId: String(record._id),
      details: `Administrator deleted daily performance response for date ${record.date}`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Daily performance response moved to Bin successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete daily performance entry';
    return res.status(500).json({ message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/daily-performance/bulk-delete — Bulk delete daily performance records
// ──────────────────────────────────────────────────────────────────────────
router.post('/daily-performance/bulk-delete', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid request body.' });
    }

    const ids = parsed.data.ids;
    const result = await DailyPerformance.updateMany(
      { _id: { $in: ids } },
      { $set: { deletedAt: new Date(), deletedBy: req.user!.id, deletionReason: 'Bulk deleted by administrator' } },
    );

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'DAILY_PERFORMANCE',
      targetId: 'BULK',
      details: `Administrator moved ${result.modifiedCount} daily performance entries to Bin.`,
      ipAddress: req.ip,
    });

    return res.json({
      message: `${result.modifiedCount} ${result.modifiedCount === 1 ? 'daily performance entry' : 'daily performance entries'} moved to Bin successfully.`,
      deletedCount: result.modifiedCount,
      deletedIds: ids,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to bulk delete daily performance entries';
    return res.status(500).json({ message });
  }
});

// GET /api/admin/mentors/:id/reminder-settings — Admin view mentor's reminder schedule
router.get('/mentors/:id/reminder-settings', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { getMentorReminderSettings } = await import('../services/reminderSchedulerService.js');
    const mentorId = String(req.params.id);
    const settings = await getMentorReminderSettings(mentorId);
    return res.json({ settings });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Unable to retrieve mentor reminder settings.' });
  }
});

// PUT /api/admin/mentors/:id/reminder-settings — Admin update mentor's reminder schedule
router.put('/mentors/:id/reminder-settings', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { saveMentorReminderSettings } = await import('../services/reminderSchedulerService.js');
    const mentorId = String(req.params.id);
    const updated = await saveMentorReminderSettings(mentorId, req.body);
    return res.json({
      message: 'Daily progress reminder settings updated.',
      settings: updated,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Unable to update mentor reminder settings.' });
  }
});

// POST /api/admin/reminders/evaluate — Admin trigger reminder evaluation cycle
router.post('/reminders/evaluate', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const { evaluateDailyProgressReminders } = await import('../services/reminderSchedulerService.js');
    const result = await evaluateDailyProgressReminders();
    return res.json({
      message: 'Daily progress reminder evaluation completed.',
      result,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to evaluate reminders.' });
  }
});

export default router;

