import mongoose from 'mongoose';
import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';

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
    const mentees = await Mentee.find().sort({ createdAt: -1 }).lean();

    const payload = await Promise.all(
      mentees.map(async (mentee) => {
        const menteeId = String(mentee._id);

        // Find assigned mentor
        const assignment = await Mentorship.findOne({ menteeId, status: 'active' }).lean();
        let assignedMentorName = 'Unassigned';
        if (assignment) {
          const mentorProfile = await Mentor.findById(assignment.mentorId).lean();
          if (mentorProfile) {
            const mentorUser = await User.findById(mentorProfile.userId, { name: 1 }).lean();
            assignedMentorName = mentorUser?.name ?? 'Unknown mentor';
          }
        }

        // Total calls and last call
        const totalCalls = await Call.countDocuments({ menteeId });
        const lastCallDoc = await Call.findOne({ menteeId }).sort({ date: -1 }).lean();
        const lastCallDate = lastCallDoc
          ? new Date(lastCallDoc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No calls yet';

        const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

        return {
          id: menteeId,
          name: mentee.name,
          standard: mentee.standard,
          guardian: contactInfo?.guardian ?? '',
          phone: contactInfo?.phone ?? '',
          status: mentee.status,
          assignedMentor: assignedMentorName,
          totalCalls,
          lastCallDate,
          createdAt: mentee.createdAt,
        };
      }),
    );

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
    const mentees = await Mentee.find({ _id: { $in: menteeIds } }).lean();

    const payload = await Promise.all(
      mentees.map(async (mentee) => {
        const menteeId = String(mentee._id);
        const totalCalls = await Call.countDocuments({ menteeId, mentorId });
        const lastCallDoc = await Call.findOne({ menteeId, mentorId }).sort({ date: -1 }).lean();
        const lastCallDate = lastCallDoc
          ? new Date(lastCallDoc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No calls yet';

        const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

        return {
          id: menteeId,
          name: mentee.name,
          standard: mentee.standard,
          guardian: contactInfo?.guardian ?? '',
          phone: contactInfo?.phone ?? '',
          status: mentee.status,
          totalCalls,
          lastCallDate,
        };
      }),
    );

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
    }

    const calls = await Call.find({ menteeId }).sort({ date: -1 }).lean();
    const contactInfo = mentee.contactInformation as Record<string, string> | undefined;

    return res.json({
      mentee: {
        id: menteeId,
        name: mentee.name,
        standard: mentee.standard,
        guardian: contactInfo?.guardian ?? '',
        phone: contactInfo?.phone ?? '',
        status: mentee.status,
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

export default router;
