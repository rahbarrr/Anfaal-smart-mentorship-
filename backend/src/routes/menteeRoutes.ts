import mongoose from 'mongoose';
import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const createMenteeSchema = z.object({
  name: z.string().min(2),
  standard: z.string().min(1),
  phone: z.string().optional(),
  guardian: z.string().optional(),
});

const updateMenteeSchema = z.object({
  name: z.string().min(2).optional(),
  standard: z.string().min(1).optional(),
  phone: z.string().optional(),
  guardian: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// GET /api/mentees — all mentees with enriched data (admin only)
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(_req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 250) : 100;
    const mentees = await Mentee.find().sort({ createdAt: -1 }).limit(limit).lean();
    const menteeIds = mentees.map((mentee) => String(mentee._id));
    const [assignments, callStats] = await Promise.all([
      Mentorship.find({ menteeId: { $in: menteeIds }, status: 'active' }).lean(),
      Call.aggregate<{ _id: string; totalCalls: number; lastCallDate: Date }>([
        { $match: { menteeId: { $in: menteeIds } } },
        { $group: { _id: '$menteeId', totalCalls: { $sum: 1 }, lastCallDate: { $max: '$date' } } },
      ]),
    ]);
    const mentorIds = [...new Set(assignments.map((assignment) => assignment.mentorId))];
    const mentors = await Mentor.find({ _id: { $in: mentorIds } }, { userId: 1 }).lean();
    const users = await User.find({ _id: { $in: mentors.map((mentor) => mentor.userId) } }, { name: 1 }).lean();
    const userNames = new Map(users.map((user) => [String(user._id), user.name]));
    const mentorNames = new Map(mentors.map((mentor) => [String(mentor._id), userNames.get(String(mentor.userId)) ?? 'Unknown mentor']));
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.menteeId, mentorNames.get(assignment.mentorId) ?? 'Unknown mentor']));
    const callStatsMap = new Map(callStats.map((stat) => [String(stat._id), stat]));
    const payload = mentees.map((mentee) => {
        const menteeId = String(mentee._id);
        const stats = callStatsMap.get(menteeId);
        const contactInfo = mentee.contactInformation as Record<string, string> | undefined;
        return {
          id: menteeId,
          name: mentee.name,
          standard: mentee.standard,
          guardian: contactInfo?.guardian ?? '',
          phone: contactInfo?.phone ?? '',
          status: mentee.status,
          assignedMentor: assignmentMap.get(menteeId) ?? 'Unassigned',
          totalCalls: stats?.totalCalls ?? 0,
          lastCallDate: stats?.lastCallDate
            ? new Date(stats.lastCallDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'No calls yet',
          createdAt: mentee.createdAt,
        };
      });

    return res.json({ mentees: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentees';
    return res.status(500).json({ message });
  }
});

// GET /api/mentees/my — mentees assigned to the logged-in mentor
router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'MENTOR') {
      return res.status(403).json({ message: 'Only mentors can access their assigned mentees.' });
    }

    // Get the mentor profile from userId
    const mentorProfile = await Mentor.findOne({ userId: req.user.id }).lean();
    if (!mentorProfile) {
      return res.json({ mentees: [] });
    }

    const mentorId = String(mentorProfile._id);
    const assignments = await Mentorship.find({ mentorId, status: 'active' }).lean();
    const menteeIds = assignments.map((a) => a.menteeId);
    const todayStr = new Date().toISOString().split('T')[0];
    const [mentees, callStats, todayPerformances] = await Promise.all([
      Mentee.find({ _id: { $in: menteeIds } }).lean(),
      Call.aggregate<{ _id: string; totalCalls: number; lastCallDate: Date; lastCallSummary?: string }>([
        { $match: { menteeId: { $in: menteeIds }, mentorId } },
        { $sort: { date: -1 } },
        { $group: { _id: '$menteeId', totalCalls: { $sum: 1 }, lastCallDate: { $first: '$date' }, lastCallSummary: { $first: { $ifNull: ['$aiSummary.shortSummary', '$summary'] } } } },
      ]),
      DailyPerformance.find({ menteeId: { $in: menteeIds }, date: todayStr }).lean(),
    ]);

    const callStatsMap = new Map(callStats.map((stat) => [String(stat._id), stat]));
    const performanceMap = new Map(todayPerformances.map((performance) => [String(performance.menteeId), performance]));
    const payload = mentees.map((mentee) => {
        const menteeId = String(mentee._id);
        const callStat = callStatsMap.get(menteeId);
        const todayPerf = performanceMap.get(menteeId);
        const lastCallDate = callStat?.lastCallDate
          ? new Date(callStat.lastCallDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No calls yet';
        const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

        return {
          id: menteeId,
          name: mentee.name,
          standard: mentee.standard,
          guardian: contactInfo?.guardian ?? '',
          phone: contactInfo?.phone ?? '',
          status: mentee.status,
          totalCalls: callStat?.totalCalls ?? 0,
          lastCallDate,
          lastCallSummary: callStat?.lastCallSummary || null,
          todayProgress: todayPerf
            ? {
                studyMinutes: todayPerf.studyMinutes,
                studyFormatted: `${Math.floor(todayPerf.studyMinutes / 60)}h ${todayPerf.studyMinutes % 60}m`,
                quranRuku: todayPerf.quran?.ruku || 0,
                quranAyat: todayPerf.quran?.ayat || 0,
                quranPages: todayPerf.quran?.pages || 0,
                readingMinutes: todayPerf.readingMinutes || 0,
                dayRating: todayPerf.dayRating,
                submitted: true,
                needsMentorHelp: Boolean(todayPerf.needsMentorHelp),
                mentorHelpNote: todayPerf.mentorHelpNote || '',
                dailyReflection: todayPerf.dailyReflection || '',
              }
            : null,
        };
      });

    return res.json({ mentees: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch assigned mentees';
    return res.status(500).json({ message });
  }
});

// GET /api/mentees/:id — single mentee with full call history
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
    const isValidId = mongoose.Types.ObjectId.isValid(rawId);
    const mentee = isValidId
      ? await Mentee.findById(rawId).lean()
      : await Mentee.findOne({ name: new RegExp(`^${rawId}$`, 'i') }).lean();

    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    const menteeId = String(mentee._id);

    // Check mentor access
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id }).lean();
      if (!mentorProfile) {
        return res.status(403).json({ message: 'Mentor profile not found.' });
      }
      const assignment = await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId, status: 'active' }).lean();
      if (!assignment) {
        return res.status(403).json({ message: 'You do not have access to this mentee.' });
      }
    } else if (req.user?.role === 'MENTEE') {
      const allowedIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      if (!allowedIds.includes(menteeId)) {
        return res.status(403).json({ message: 'Access denied: You can only view your own profile.' });
      }
    }

    const requestedLimit = Number(req.query.limit || 25);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 25;
    const calls = await Call.find({ menteeId }).sort({ date: -1, _id: -1 }).limit(limit).lean();
    const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

    // Resolve assigned mentor name
    const activeAssignment = await Mentorship.findOne({ menteeId, status: 'active' }).lean();
    let assignedMentorName = '';
    if (activeAssignment) {
      const mentorDoc = await Mentor.findById(activeAssignment.mentorId).lean();
      if (mentorDoc) {
        const userDoc = await User.findById(mentorDoc.userId).lean();
        assignedMentorName = userDoc?.name ?? 'Assigned Mentor';
      }
    }

    return res.json({
      mentee: {
        id: menteeId,
        name: mentee.name,
        standard: mentee.standard,
        guardian: contactInfo?.guardian ?? '',
        phone: contactInfo?.phone ?? '',
        status: mentee.status,
        assignedMentor: assignedMentorName || 'Unassigned',
        createdAt: mentee.createdAt,
      },
      calls: calls.map((call) => ({
        id: String(call._id),
        date: call.date,
        duration: call.duration,
        reviewStatus: call.reviewStatus,
        summary: call.summary,
        keyDiscussionPoints: call.keyDiscussionPoints,
        studentConcerns: call.studentConcerns,
        actionItems: call.actionItems,
        followUpRecommendations: call.followUpRecommendations,
        topicsDiscussed: call.topicsDiscussed,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentee';
    return res.status(500).json({ message });
  }
});

// POST /api/mentees — create a new mentee (admin only)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createMenteeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a valid name and standard.' });
    }

    const mentee = await Mentee.create({
      name: parsed.data.name,
      standard: parsed.data.standard,
      contactInformation: {
        phone: parsed.data.phone ?? '',
        guardian: parsed.data.guardian ?? '',
      },
      status: 'active',
    });

    return res.status(201).json({
      message: 'Mentee created successfully.',
      mentee: {
        id: String(mentee._id),
        name: mentee.name,
        standard: mentee.standard,
        status: mentee.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create mentee';
    return res.status(500).json({ message });
  }
});

// PATCH /api/mentees/:id — update a mentee (admin only)
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateMenteeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid update data.' });
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.name) update.name = parsed.data.name;
    if (parsed.data.standard) update.standard = parsed.data.standard;
    if (parsed.data.status) update.status = parsed.data.status;
    if (parsed.data.phone || parsed.data.guardian) {
      const existing = await Mentee.findById(req.params.id).lean();
      const existingContact = (existing?.contactInformation as Record<string, string>) ?? {};
      update.contactInformation = {
        ...existingContact,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.guardian ? { guardian: parsed.data.guardian } : {}),
      };
    }

    const mentee = await Mentee.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    return res.json({ message: 'Mentee updated.', mentee: { id: String(mentee._id), name: mentee.name, status: mentee.status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update mentee';
    return res.status(500).json({ message });
  }
});


// DELETE /api/mentees/:id — permanently remove a mentee and all linked data (admin only)
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const mentee = await Mentee.findById(req.params.id);
    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    const menteeId = String(mentee._id);

    // Cascade: remove all mentorship assignments for this mentee
    await Mentorship.deleteMany({ menteeId });

    // Cascade: remove all call records for this mentee
    await Call.deleteMany({ menteeId });

    // Remove the mentee profile
    await Mentee.findByIdAndDelete(req.params.id);

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'MENTEE',
      targetId: menteeId,
      menteeName: mentee.name,
      details: `Permanently deleted mentee profile ${mentee.name} and linked records`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Mentee and all associated data removed successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete mentee';
    return res.status(500).json({ message });
  }
});

export default router;

