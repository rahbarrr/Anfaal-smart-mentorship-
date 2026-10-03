import { Router, Response } from 'express';
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

const createAssignmentSchema = z.object({
  mentorId: z.string().min(1),
  menteeId: z.string().min(1),
  status: z.enum(['active', 'archived']).optional(),
});

const router = Router();

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
    const deleted = await Mentorship.findByIdAndDelete(req.params.assignmentId);
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
      calls: calls.map((call) => ({
        id: String(call._id),
        mentorId: call.mentorId,
        menteeId: call.menteeId,
        date: call.date,
        duration: call.duration,
        summary: call.summary,
        recordingUrl: call.recordingUrl,
        reviewStatus: call.reviewStatus,
      })),
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
    if (!call || !call.recordingUrl) {
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

    const rows = filteredCalls.map((call) => {
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
  let storageDeleted = true;
  let storageError: string | undefined;

  const storageKey = call.recording?.storageKey || call.recording?.fileName || (call.recordingUrl ? call.recordingUrl.split('/').pop() : undefined);
  if (storageKey) {
    try {
      const storageProvider = createStorageProvider();
      await storageProvider.deleteFile(storageKey);
    } catch (err) {
      storageDeleted = false;
      storageError = err instanceof Error ? err.message : String(err);
      console.warn(`[AdminRoutes] Failed to delete storage for key "${storageKey}":`, storageError);
    }
  }

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
    await Call.findByIdAndDelete(req.params.id);

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
      message: storageDeleted
        ? 'Call record and all associated resources deleted successfully.'
        : `Call deleted from database, but audio cleanup failed: ${storageError}`,
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

    const storageKey = call.recording?.storageKey || call.recording?.fileName || (call.recordingUrl ? call.recordingUrl.split('/').pop() : undefined);
    let storageDeleted = true;
    let storageError: string | undefined;

    if (storageKey) {
      try {
        const storageProvider = createStorageProvider();
        await storageProvider.deleteFile(storageKey);
      } catch (err) {
        storageDeleted = false;
        storageError = err instanceof Error ? err.message : String(err);
      }
    }

    await Call.findByIdAndUpdate(req.params.id, {
      $unset: { recording: 1, recordingUrl: 1 },
      $set: { recordingStatus: 'failed' },
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
      message: storageDeleted
        ? 'Call recording file deleted successfully.'
        : `Recording removed from call, but storage file cleanup reported: ${storageError}`,
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

    await Call.findByIdAndUpdate(req.params.id, {
      $unset: { summary: 1, summaryVersions: 1 },
      $set: { 'aiSummary.shortSummary': '' },
    });

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

    return res.json({ message: 'Call summary deleted successfully.' });
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

    await Call.findByIdAndUpdate(req.params.id, {
      $unset: { aiSummary: 1 },
      $set: {
        keyDiscussionPoints: [],
        studentConcerns: [],
        actionItems: [],
        followUpRecommendations: [],
        topicsDiscussed: [],
        aiStatus: 'pending',
      },
    });

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

    return res.json({ message: 'Call intelligence deleted successfully.' });
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
        await Call.findByIdAndDelete(call._id);
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
      message: `${deletedIds.length} ${deletedIds.length === 1 ? 'call' : 'calls'} deleted successfully.${failedIds.length > 0 ? ` (${failedIds.length} could not be deleted)` : ''}`,
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

    await DailyPerformance.findByIdAndDelete(req.params.id);

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

    return res.json({ message: 'Daily performance response deleted successfully.' });
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
    const result = await DailyPerformance.deleteMany({ _id: { $in: ids } });

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'DAILY_PERFORMANCE',
      targetId: 'BULK',
      details: `Administrator bulk deleted ${result.deletedCount} daily performance entries.`,
      ipAddress: req.ip,
    });

    return res.json({
      message: `${result.deletedCount} ${result.deletedCount === 1 ? 'daily performance entry' : 'daily performance entries'} deleted successfully.`,
      deletedCount: result.deletedCount,
      deletedIds: ids,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to bulk delete daily performance entries';
    return res.status(500).json({ message });
  }
});

export default router;

