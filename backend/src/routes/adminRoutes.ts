import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { getDashboardSummary } from '../services/dashboardService.js';
import { createStorageProvider } from '../services/storageService.js';
import { summarizeAssignments } from '../services/mentorshipService.js';
import { logAuditEvent } from '../services/auditService.js';

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

export default router;

