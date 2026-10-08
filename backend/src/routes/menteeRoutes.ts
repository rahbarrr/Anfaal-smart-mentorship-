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
  makid: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  guardian: z.string().optional(),
});

const updateMenteeSchema = z.object({
  name: z.string().min(2).optional(),
  standard: z.string().min(1).optional(),
  makid: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  guardian: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  assignedMentorId: z.string().optional(),
});

// GET /api/mentees — all mentees with enriched data (admin only)
router.get('/', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 250) : 50;
    const requestedPage = Number(req.query.page || 1);
    const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const s = req.query.search.trim();
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { makid: { $regex: s, $options: 'i' } },
        { standard: { $regex: s, $options: 'i' } },
      ];
    }
    if (typeof req.query.status === 'string' && (req.query.status === 'active' || req.query.status === 'inactive')) {
      filter.status = req.query.status;
    }

    const [total, mentees] = await Promise.all([
      Mentee.countDocuments(filter),
      Mentee.find(filter, {
        name: 1,
        standard: 1,
        makid: 1,
        location: 1,
        contactInformation: 1,
        status: 1,
        createdAt: 1,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

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
          makid: mentee.makid ?? '',
          location: mentee.location ?? contactInfo?.location ?? '',
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

    return res.json({
      mentees: payload,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
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
          makid: mentee.makid ?? '',
          location: mentee.location ?? contactInfo?.location ?? '',
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
                submittedAt: todayPerf.submittedAt || todayPerf.createdAt,
                updatedAt: todayPerf.updatedAt,
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

// GET /api/mentees/:id — single mentee with complete 360 profile
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

    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 50;

    const [calls, dailyPerfRecords, activeAssignment] = await Promise.all([
      Call.find({ menteeId }).sort({ date: -1, _id: -1 }).limit(limit).lean(),
      DailyPerformance.find({ menteeId }).sort({ date: -1 }).lean(),
      Mentorship.findOne({ menteeId, status: 'active' }).lean(),
    ]);

    const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

    // Resolve assigned mentor name
    let assignedMentorName = '';
    let assignedMentorId = '';
    if (activeAssignment) {
      assignedMentorId = activeAssignment.mentorId;
      const mentorDoc = await Mentor.findById(activeAssignment.mentorId).lean();
      if (mentorDoc) {
        const userDoc = await User.findById(mentorDoc.userId).lean();
        assignedMentorName = userDoc?.name ?? 'Assigned Mentor';
      }
    }

    // Resolve mentors for all calls
    const callMentorIds = [...new Set(calls.map((c) => c.mentorId))];
    const mentors = await Mentor.find({ _id: { $in: callMentorIds } }).lean();
    const users = await User.find({ _id: { $in: mentors.map((m) => m.userId) } }).lean();
    const userNames = new Map(users.map((u) => [String(u._id), u.name]));
    const mentorNames = new Map(mentors.map((m) => [String(m._id), userNames.get(String(m.userId)) || 'Mentor']));

    // Enriched calls list
    const enrichedCalls = calls.map((call) => ({
      id: String(call._id),
      mentorId: call.mentorId,
      mentorName: mentorNames.get(String(call.mentorId)) || assignedMentorName || 'Mentor',
      date: call.date,
      uploadedAt: call.uploadedAt || call.createdAt || call.date,
      duration: call.duration,
      reviewStatus: call.reviewStatus,
      processingStatus: call.processingStatus || 'completed',
      recordingStatus: call.recordingStatus || (call.recordingUrl ? 'uploaded' : 'pending'),
      recordingUrl: call.recordingUrl || call.recording?.url || '',
      summary: call.summary,
      aiSummary: call.aiSummary,
      transcript: call.transcript || call.transcription?.text || '',
      keyDiscussionPoints: call.keyDiscussionPoints || [],
      studentConcerns: call.studentConcerns || [],
      actionItems: call.actionItems || [],
      followUpRecommendations: call.followUpRecommendations || [],
      topicsDiscussed: call.topicsDiscussed || [],
    }));

    const academic = mentee.academic || null;
    const goals = mentee.goals || null;
    const routine = mentee.routine || null;
    const careerInterests = mentee.careerInterests || null;
    const challenges = Array.isArray(mentee.challenges) ? mentee.challenges : [];
    const notes = Array.isArray(mentee.notes) ? mentee.notes : [];

    // Daily Performance Summary Metrics
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentWeeklyLogs = dailyPerfRecords.filter((p) => new Date(p.date) >= sevenDaysAgo);
    const responsesThisWeek = recentWeeklyLogs.length;

    const totalSubmissions = dailyPerfRecords.length;
    const totalStudyMin = dailyPerfRecords.reduce((acc, p) => acc + (p.studyMinutes || 0), 0);
    const avgStudyMinutes = totalSubmissions > 0 ? Math.round(totalStudyMin / totalSubmissions) : 0;
    const avgStudyTimeHours = (avgStudyMinutes / 60).toFixed(1);

    // Calculate current streak
    let streak = 0;
    const dateSet = new Set(dailyPerfRecords.map((p) => p.date));
    let checkDate = new Date();
    const todayStr = checkDate.toISOString().split('T')[0];
    if (!dateSet.has(todayStr)) {
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    }
    while (dateSet.has(checkDate.toISOString().split('T')[0])) {
      streak += 1;
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    }
    const currentStreak = streak;
    const taskCompletion = totalSubmissions > 0 ? Math.min(100, Math.round((responsesThisWeek / 7) * 100)) : 0;

    const dailyPerformanceSummary = {
      responsesThisWeek: `${Math.min(responsesThisWeek, 7)}/7`,
      avgStudyTimeHours: totalSubmissions > 0 ? `${avgStudyTimeHours} hrs` : 'Not provided',
      avgStudyMinutes,
      taskCompletion: `${taskCompletion}%`,
      currentStreak: `${currentStreak} days`,
      totalSubmissions,
      latestSubmission: dailyPerfRecords[0] || null,
    };

    // Synthesize chronological activity timeline
    const timelineItems: Array<{
      id: string;
      type: 'daily_performance' | 'call' | 'note' | 'goal' | 'challenge';
      title: string;
      timestamp: Date;
      description: string;
      refId?: string;
      meta?: Record<string, unknown>;
    }> = [];

    dailyPerfRecords.slice(0, 15).forEach((p) => {
      timelineItems.push({
        id: `dp-${p._id}`,
        type: 'daily_performance',
        title: 'Daily response submitted',
        timestamp: new Date(p.submittedAt || p.createdAt || p.date),
        description: `Study: ${Math.floor(p.studyMinutes / 60)}h ${p.studyMinutes % 60}m · Quran: ${p.quran?.ruku || 0} Ruku · Rating: ${p.dayRating}/5`,
        refId: String(p._id),
        meta: { studyMinutes: p.studyMinutes, dayRating: p.dayRating },
      });
    });

    enrichedCalls.slice(0, 10).forEach((c) => {
      timelineItems.push({
        id: `call-${c.id}`,
        type: 'call',
        title: `Mentor call completed — ${c.duration} min`,
        timestamp: new Date(c.date || c.uploadedAt),
        description: `Mentor: ${c.mentorName}${c.aiSummary?.shortSummary ? ` · ${c.aiSummary.shortSummary}` : ''}`,
        refId: c.id,
        meta: { duration: c.duration, mentorName: c.mentorName },
      });
    });

    notes.slice(0, 10).forEach((n: any) => {
      if (n && n.note) {
        timelineItems.push({
          id: `note-${n.id || Math.random()}`,
          type: 'note',
          title: `Mentor note added (${n.category || 'General'})`,
          timestamp: new Date(n.createdAt || Date.now()),
          description: `By ${n.mentorName || 'Mentor'}: "${n.note.length > 120 ? n.note.slice(0, 120) + '…' : n.note}"`,
          refId: n.id,
        });
      }
    });

    if (goals && Array.isArray(goals.shortTermGoals)) {
      goals.shortTermGoals.forEach((g: any) => {
        if (g && (g.updatedAt || g.createdAt)) {
          timelineItems.push({
            id: `goal-${g.id || Math.random()}`,
            type: 'goal',
            title: `Goal updated: ${g.title || 'Goal'}`,
            timestamp: new Date(g.updatedAt || g.createdAt),
            description: `Status: ${g.status || 'In Progress'} · Progress: ${g.progress ?? 0}%`,
            refId: g.id,
            meta: { progress: g.progress, status: g.status },
          });
        }
      });
    }

    challenges.forEach((ch: any) => {
      if (ch && (ch.updatedAt || ch.createdAt)) {
        timelineItems.push({
          id: `challenge-${ch.id || Math.random()}`,
          type: 'challenge',
          title: `Challenge tracked: ${ch.title || 'Challenge'}`,
          timestamp: new Date(ch.updatedAt || ch.createdAt),
          description: `Priority: ${ch.priority || 'Medium'} · Status: ${ch.status || 'In Progress'} · Progress: ${ch.progress ?? 0}%`,
          refId: ch.id,
          meta: { priority: ch.priority, status: ch.status },
        });
      }
    });

    // Sort timeline by timestamp descending
    timelineItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Determine last activity timestamp
    const lastActivity = timelineItems[0]?.timestamp || mentee.createdAt;

    const makidDisplay = mentee.makid ?? '';
    const locationDisplay = mentee.location ?? contactInfo?.location ?? '';

    return res.json({
      mentee: {
        id: menteeId,
        name: mentee.name,
        standard: mentee.standard,
        makid: makidDisplay,
        location: locationDisplay,
        guardian: contactInfo?.guardian ?? '',
        phone: contactInfo?.phone ?? '',
        status: mentee.status,
        assignedMentor: assignedMentorName || 'Unassigned',
        assignedMentorId,
        createdAt: mentee.createdAt,
        lastActivity,
        academic,
        goals,
        routine,
        careerInterests,
        challenges,
        notes,
      },
      calls: enrichedCalls,
      dailyPerformanceSummary,
      timeline: timelineItems.slice(0, 40),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentee';
    return res.status(500).json({ message });
  }
});

// POST /api/mentees/:id/notes — add a mentor note
router.post('/:id/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const menteeId = String(req.params.id);
    const mentee = await Mentee.findById(menteeId);
    if (!mentee) return res.status(404).json({ message: 'Mentee not found.' });

    // Permissions: Admin or assigned Mentor
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id }).lean();
      if (!mentorProfile) return res.status(403).json({ message: 'Mentor profile not found.' });
      const assignment = await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId, status: 'active' }).lean();
      if (!assignment) return res.status(403).json({ message: 'You do not have access to this mentee.' });
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only mentors and administrators can add notes.' });
    }

    const { note, category } = req.body;
    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ message: 'Note text cannot be empty.' });
    }

    const authorUser = await User.findById(req.user?.id).lean();
    const mentorName = authorUser?.name || (req.user?.role === 'ADMIN' ? 'Anfaal Administrator' : 'Assigned Mentor');

    const newNote = {
      id: `note-${Date.now()}`,
      mentorId: req.user?.id,
      mentorName,
      note: note.trim(),
      category: category || 'General',
      createdAt: new Date(),
    };

    const currentNotes = Array.isArray(mentee.notes) ? mentee.notes : [];
    mentee.notes = [newNote, ...currentNotes];
    await mentee.save();

    return res.status(201).json({ message: 'Note added successfully.', notes: mentee.notes, note: newNote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add note';
    return res.status(500).json({ message });
  }
});

// DELETE /api/mentees/:id/notes/:noteId — delete a mentor note
router.delete('/:id/notes/:noteId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const menteeId = String(req.params.id);
    const { noteId } = req.params;
    const mentee = await Mentee.findById(menteeId);
    if (!mentee) return res.status(404).json({ message: 'Mentee not found.' });

    if (req.user?.role !== 'ADMIN') {
      const mentorProfile = await Mentor.findOne({ userId: req.user?.id }).lean();
      const assignment = mentorProfile ? await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId, status: 'active' }).lean() : null;
      if (!assignment) return res.status(403).json({ message: 'You do not have permission to delete this note.' });
    }

    const currentNotes = Array.isArray(mentee.notes) ? mentee.notes : [];
    mentee.notes = currentNotes.filter((n: any) => String(n.id) !== String(noteId));
    await mentee.save();

    return res.json({ message: 'Note deleted successfully.', notes: mentee.notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete note';
    return res.status(500).json({ message });
  }
});

// PATCH /api/mentees/:id/360 — update 360 profile sections (academic, goals, routine, careerInterests, challenges, location)
router.patch('/:id/360', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const menteeId = String(req.params.id);
    const mentee = await Mentee.findById(menteeId);
    if (!mentee) return res.status(404).json({ message: 'Mentee not found.' });

    // Permissions: Admin, assigned Mentor, or the Mentee themselves
    if (req.user?.role === 'MENTOR') {
      const mentorProfile = await Mentor.findOne({ userId: req.user.id }).lean();
      if (!mentorProfile) return res.status(403).json({ message: 'Mentor profile not found.' });
      const assignment = await Mentorship.findOne({ mentorId: String(mentorProfile._id), menteeId, status: 'active' }).lean();
      if (!assignment) return res.status(403).json({ message: 'You do not have access to this mentee.' });
    } else if (req.user?.role === 'MENTEE') {
      const allowedIds = [req.user.id, ...(req.user.menteeId ? [req.user.menteeId] : [])];
      if (!allowedIds.includes(menteeId)) {
        return res.status(403).json({ message: 'Access denied: You can only update your own profile.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { academic, goals, routine, careerInterests, challenges, location } = req.body;

    if (location !== undefined) mentee.location = String(location).trim();
    if (academic !== undefined) mentee.academic = { ...(mentee.academic || {}), ...academic };
    if (goals !== undefined) mentee.goals = { ...(mentee.goals || {}), ...goals };
    if (routine !== undefined) mentee.routine = { ...(mentee.routine || {}), ...routine };
    if (careerInterests !== undefined) mentee.careerInterests = { ...(mentee.careerInterests || {}), ...careerInterests };
    if (challenges !== undefined) mentee.challenges = challenges;

    await mentee.save();

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'User',
      userRole: req.user!.role,
      action: 'UPDATE_RECORD',
      targetType: 'MENTEE',
      targetId: menteeId,
      menteeName: mentee.name,
      details: 'Updated 360 profile sections',
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Mentee 360° profile updated successfully.',
      mentee: {
        id: String(mentee._id),
        academic: mentee.academic,
        goals: mentee.goals,
        routine: mentee.routine,
        careerInterests: mentee.careerInterests,
        challenges: mentee.challenges,
        location: mentee.location,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update 360 profile';
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
      makid: parsed.data.makid ? parsed.data.makid.trim().toUpperCase() : undefined,
      location: parsed.data.location ? parsed.data.location.trim() : undefined,
      contactInformation: {
        phone: parsed.data.phone ?? '',
        guardian: parsed.data.guardian ?? '',
        location: parsed.data.location ?? '',
      },
      status: 'active',
    });

    return res.status(201).json({
      message: 'Mentee created successfully.',
      mentee: {
        id: String(mentee._id),
        name: mentee.name,
        standard: mentee.standard,
        makid: mentee.makid ?? '',
        status: mentee.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create mentee';
    return res.status(500).json({ message });
  }
});

// PATCH /api/mentees/:id — update core mentee details (admin only)
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateMenteeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid update data.' });
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.name) update.name = parsed.data.name;
    if (parsed.data.standard) update.standard = parsed.data.standard;
    if (parsed.data.makid) update.makid = parsed.data.makid.trim().toUpperCase();
    if (parsed.data.location) update.location = parsed.data.location.trim();
    if (parsed.data.status) update.status = parsed.data.status;
    if (parsed.data.phone || parsed.data.guardian || parsed.data.location) {
      const existing = await Mentee.findById(req.params.id).lean();
      const existingContact = (existing?.contactInformation as Record<string, string>) ?? {};
      update.contactInformation = {
        ...existingContact,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.guardian ? { guardian: parsed.data.guardian } : {}),
        ...(parsed.data.location ? { location: parsed.data.location } : {}),
      };
    }

    const mentee = await Mentee.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    // Handle mentor assignment update if provided
    if (parsed.data.assignedMentorId !== undefined) {
      const menteeId = String(mentee._id);
      // Archive current active assignment
      await Mentorship.updateMany({ menteeId, status: 'active' }, { $set: { status: 'archived' } });
      if (parsed.data.assignedMentorId && parsed.data.assignedMentorId !== 'unassigned') {
        const mentorExists = await Mentor.findById(parsed.data.assignedMentorId);
        if (mentorExists) {
          await Mentorship.create({
            mentorId: parsed.data.assignedMentorId,
            menteeId,
            status: 'active',
            assignedAt: new Date(),
          });
        }
      }
    }

    return res.json({
      message: 'Mentee updated.',
      mentee: {
        id: String(mentee._id),
        name: mentee.name,
        standard: mentee.standard,
        makid: mentee.makid,
        status: mentee.status,
      },
    });
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

