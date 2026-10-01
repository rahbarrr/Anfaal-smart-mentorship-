import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Mentor } from '../models/Mentor.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';
import { logAuditEvent } from '../services/auditService.js';

const router = Router();

const createMentorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12),
  phone: z.string().optional(),
  bio: z.string().optional(),
});

export const mentorRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  phone: z.string().trim().min(8, 'Please provide a valid phone number.'),
  gender: z.string().trim().optional().default(''),
  bio: z.string().trim().min(10, 'Please share a bit more about your mentorship background.').max(500).optional().or(z.literal('')),
  expertise: z.string().trim().min(3, 'Please tell us your expertise.').max(200).optional().or(z.literal('')),
  availability: z.string().trim().min(2, 'Please share your availability.').max(120).optional().or(z.literal('')),
  location: z.string().trim().min(2, 'Please share your location.').max(120).optional().or(z.literal('')),
  preferredSubjects: z.array(z.string().trim().min(1)).max(8).optional().default([]),
});

export function normalizeMentorRegistration(input: unknown) {
  const parsed = mentorRegistrationSchema.parse(input);
  const digits = parsed.phone.replace(/\D/g, '');

  let normalizedPhone = digits;
  if (digits.length === 10) {
    normalizedPhone = `+91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    normalizedPhone = `+${digits}`;
  } else if (digits.length > 0) {
    normalizedPhone = `+${digits}`;
  }

  if (!normalizedPhone || normalizedPhone === '+') {
    throw new Error('Please provide a valid phone number.');
  }

  return {
    name: parsed.fullName.trim().replace(/\s+/g, ' '),
    email: parsed.email.trim().toLowerCase(),
    phone: normalizedPhone,
    password: parsed.password,
    gender: parsed.gender?.trim() ?? '',
    bio: parsed.bio?.trim() ?? '',
    expertise: parsed.expertise?.trim() ?? '',
    availability: parsed.availability?.trim() ?? '',
    location: parsed.location?.trim() ?? '',
    preferredSubjects: parsed.preferredSubjects.map((item) => item.trim()).filter(Boolean),
    status: 'disabled' as const,
  };
}

// GET /api/mentors — list all mentors with enriched stats (admin only)
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const requestedLimit = Number(_req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 250) : 100;
    const mentors = await Mentor.find().limit(limit).lean();
    const userIds = mentors.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }, { name: 1, email: 1, status: 1 }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mentorIds = mentors.map((mentor) => String(mentor._id));
    const [assignmentStats, callStats] = await Promise.all([
      Mentorship.aggregate<{ _id: string; assignedMentees: number }>([
        { $match: { mentorId: { $in: mentorIds }, status: 'active' } },
        { $group: { _id: '$mentorId', assignedMentees: { $sum: 1 } } },
      ]),
      Call.aggregate<{ _id: string; callsThisMonth: number; lastActivity: Date }>([
        { $match: { mentorId: { $in: mentorIds } } },
        { $group: { _id: '$mentorId', callsThisMonth: { $sum: { $cond: [{ $gte: ['$date', startOfMonth] }, 1, 0] } }, lastActivity: { $max: '$date' } } },
      ]),
    ]);
    const assignmentMap = new Map(assignmentStats.map((stat) => [String(stat._id), stat.assignedMentees]));
    const callMap = new Map(callStats.map((stat) => [String(stat._id), stat]));
    const payload = mentors.map((mentor) => {
        const user = userMap.get(mentor.userId);
        const mentorId = String(mentor._id);
        const stats = callMap.get(mentorId);
        const lastActivity = stats?.lastActivity
          ? new Date(stats.lastActivity).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No calls yet';

        return {
          id: mentorId,
          userId: mentor.userId,
          name: user?.name ?? 'Unknown mentor',
          email: user?.email ?? 'unknown@anfaal.org',
          phone: mentor.phone ?? '',
          bio: mentor.bio ?? '',
          status: mentor.status,
          assignedMentees: assignmentMap.get(mentorId) ?? 0,
          callsThisMonth: stats?.callsThisMonth ?? 0,
          lastActivity,
        };
      });

    return res.json({ mentors: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentors';
    return res.status(500).json({ message });
  }
});

// POST /api/mentors/register — mentor self-registration submitted for review
router.post('/register', async (req, res) => {
  try {
    const normalized = normalizeMentorRegistration(req.body);

    const existingUser = await User.findOne({ email: normalized.email });
    if (existingUser) {
      return res.status(409).json({ message: 'A mentor account with this email already exists.' });
    }

    const existingPhoneMentor = await Mentor.findOne({ phone: normalized.phone });
    if (existingPhoneMentor) {
      return res.status(409).json({ message: 'A mentor account with this phone number already exists.' });
    }

    const passwordHash = await bcrypt.hash(normalized.password, 10);
    const user = await User.create({
      name: normalized.name,
      email: normalized.email,
      passwordHash,
      role: 'MENTOR',
      status: 'disabled',
    });

    const mentor = await Mentor.create({
      userId: String(user._id),
      phone: normalized.phone,
      bio: normalized.bio,
      gender: normalized.gender,
      expertise: normalized.expertise,
      availability: normalized.availability,
      location: normalized.location,
      preferredSubjects: normalized.preferredSubjects,
      status: 'disabled',
    });

    return res.status(201).json({
      message: 'Mentor registration submitted successfully. Your profile is pending admin approval.',
      mentor: {
        id: String(mentor._id),
        userId: mentor.userId,
        name: user.name,
        email: user.email,
        status: mentor.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit mentor registration';
    return res.status(400).json({ message });
  }
});

// POST /api/mentors — create a new mentor (admin only)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createMentorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide a valid name, email, and password.' });
    }

    const existing = await User.findOne({ email: parsed.data.email });
    if (existing) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: 'MENTOR',
      status: 'active',
    });

    const mentor = await Mentor.create({
      userId: String(user._id),
      phone: parsed.data.phone,
      bio: parsed.data.bio,
      status: 'active',
    });

    return res.status(201).json({
      message: 'Mentor created successfully.',
      mentor: {
        id: String(mentor._id),
        userId: mentor.userId,
        name: user.name,
        email: user.email,
        status: mentor.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create mentor';
    return res.status(500).json({ message });
  }
});

// PATCH /api/mentors/:id/status — enable or disable a mentor (admin only)
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const statusSchema = z.object({ status: z.enum(['active', 'disabled']) });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Please provide status: "active" or "disabled".' });
    }

    const mentor = await Mentor.findByIdAndUpdate(req.params.id, { status: parsed.data.status }, { new: true });
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found.' });
    }

    // Also update the linked user status
    await User.findByIdAndUpdate(mentor.userId, { status: parsed.data.status });

    return res.json({ message: `Mentor ${parsed.data.status === 'active' ? 'enabled' : 'disabled'} successfully.`, mentor: { id: String(mentor._id), status: mentor.status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update mentor status';
    return res.status(500).json({ message });
  }
});


// DELETE /api/mentors/:id — permanently remove a mentor and all linked data (admin only)
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const mentor = await Mentor.findById(req.params.id);
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found.' });
    }

    const mentorId = String(mentor._id);

    // Cascade: remove all mentorship assignments for this mentor
    await Mentorship.deleteMany({ mentorId });

    // Cascade: remove all call records by this mentor
    await Call.deleteMany({ mentorId });

    // Remove the mentor profile
    await Mentor.findByIdAndDelete(req.params.id);

    // Remove the linked user account
    await User.findByIdAndDelete(mentor.userId);

    logAuditEvent({
      userId: req.user!.id,
      userName: req.user!.email || 'Admin',
      userRole: 'ADMIN',
      action: 'DELETE_RECORD',
      targetType: 'MENTOR',
      targetId: mentorId,
      details: `Permanently deleted mentor profile ${mentorId} and cascaded records`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Mentor and all associated data removed successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete mentor';
    return res.status(500).json({ message });
  }
});

export default router;

