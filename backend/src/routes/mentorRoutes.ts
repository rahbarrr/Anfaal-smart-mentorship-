import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Mentor } from '../models/Mentor.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';

const router = Router();

const createMentorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
});

// GET /api/mentors — list all mentors with enriched stats (admin only)
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const mentors = await Mentor.find().lean();
    const userIds = mentors.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }, { name: 1, email: 1, status: 1 }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const payload = await Promise.all(
      mentors.map(async (mentor) => {
        const user = userMap.get(mentor.userId);
        const mentorId = String(mentor._id);

        // Count assigned mentees
        const assignedMentees = await Mentorship.countDocuments({ mentorId, status: 'active' });

        // Calls this month
        const callsThisMonth = await Call.countDocuments({
          mentorId,
          date: { $gte: startOfMonth },
        });

        // Last activity
        const lastCall = await Call.findOne({ mentorId }).sort({ date: -1 }).lean();
        const lastActivity = lastCall
          ? new Date(lastCall.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No calls yet';

        return {
          id: mentorId,
          userId: mentor.userId,
          name: user?.name ?? 'Unknown mentor',
          email: user?.email ?? 'unknown@anfaal.org',
          phone: mentor.phone ?? '',
          bio: mentor.bio ?? '',
          status: mentor.status,
          assignedMentees,
          callsThisMonth,
          lastActivity,
        };
      }),
    );

    return res.json({ mentors: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentors';
    return res.status(500).json({ message });
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

    const passwordHash = await bcrypt.hash(parsed.data.password ?? 'Mentor@123', 10);
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

export default router;
