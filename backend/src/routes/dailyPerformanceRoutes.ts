import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { Mentorship } from '../models/Mentorship.js';
import { createDailyPerformanceAiService } from '../services/dailyPerformanceAiService.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function resolveMenteeId(req: AuthRequest): Promise<string | null> {
  if (req.user?.menteeId) {
    return req.user.menteeId;
  }
  if (req.user?.id) {
    const menteeDoc = await Mentee.findOne({ userId: req.user.id });
    if (menteeDoc) {
      return String(menteeDoc._id);
    }
  }
  return null;
}

async function verifyMentorAccess(userId: string, menteeId: string): Promise<boolean> {
  const mentorProfile = await Mentor.findOne({ userId }).lean();
  if (!mentorProfile) return false;

  const assignment = await Mentorship.findOne({
    mentorId: String(mentorProfile._id),
    menteeId,
    status: 'active',
  }).lean();

  return Boolean(assignment);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const performanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  studyMinutes: z.number().min(0),
  quran: z
    .object({
      ruku: z.number().min(0).default(0),
      ayat: z.number().min(0).default(0),
      pages: z.number().min(0).default(0),
    })
    .default({ ruku: 0, ayat: 0, pages: 0 }),
  readingMinutes: z.number().min(0).default(0),
  dayRating: z.number().min(1).max(5),
  dailyReflection: z.string().max(1000).optional(),
  facedDifficulty: z.boolean().default(false),
  difficultyNote: z.string().max(1000).optional(),
  needsMentorHelp: z.boolean().default(false),
  mentorHelpNote: z.string().max(1000).optional(),
});

const updatePerformanceSchema = performanceSchema.partial();

// ── 1. POST /api/daily-performance (Mentee creates entry) ─────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = performanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid data provided.', errors: parsed.error.issues });
    }

    let menteeId = await resolveMenteeId(req);
    // If admin or mentor creates on behalf of mentee (optional fallback)
    if (!menteeId && (req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR') && req.body.menteeId) {
      menteeId = String(req.body.menteeId);
    }

    if (!menteeId) {
      return res.status(403).json({ message: 'Mentee profile could not be determined.' });
    }

    const targetDate = parsed.data.date || getTodayString();

    // Prevent accidental duplicate submissions
    const existing = await DailyPerformance.findOne({ menteeId, date: targetDate });
    if (existing) {
      return res.status(409).json({
        message: "Today's progress already submitted",
        existingId: String(existing._id),
        existing,
      });
    }

    const record = await DailyPerformance.create({
      menteeId,
      date: targetDate,
      studyMinutes: parsed.data.studyMinutes,
      quran: parsed.data.quran,
      readingMinutes: parsed.data.readingMinutes,
      dayRating: parsed.data.dayRating,
      dailyReflection: parsed.data.dailyReflection?.trim(),
      facedDifficulty: parsed.data.facedDifficulty,
      difficultyNote: parsed.data.facedDifficulty ? parsed.data.difficultyNote?.trim() : undefined,
      needsMentorHelp: parsed.data.needsMentorHelp,
      mentorHelpNote: parsed.data.needsMentorHelp ? parsed.data.mentorHelpNote?.trim() : undefined,
    });

    return res.status(201).json({
      message: 'Your daily progress has been recorded. Your mentor can now see your progress.',
      record,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Today's progress already submitted" });
    }
    const message = error instanceof Error ? error.message : 'Unable to record daily progress';
    return res.status(500).json({ message });
  }
});

// ── 2. GET /api/daily-performance/today ────────────────────────────────────────
router.get('/today', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let menteeId = await resolveMenteeId(req);
    if (!menteeId && (req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR') && req.query.menteeId) {
      menteeId = String(req.query.menteeId);
    }
    if (!menteeId) {
      return res.status(403).json({ message: 'Mentee profile not found.' });
    }

    const date = (req.query.date as string) || getTodayString();
    const record = await DailyPerformance.findOne({ menteeId, date }).lean();

    return res.json({ record: record ?? null, date });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch today performance';
    return res.status(500).json({ message });
  }
});

// ── 3. GET /api/daily-performance/history ──────────────────────────────────────
router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let menteeId = await resolveMenteeId(req);
    if (!menteeId && (req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR') && req.query.menteeId) {
      menteeId = String(req.query.menteeId);
    }
    if (!menteeId) {
      return res.status(403).json({ message: 'Mentee profile not found.' });
    }

    const { from, to, limit = '50', skip = '0' } = req.query;
    const filter: Record<string, unknown> = { menteeId };

    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, string>).$gte = String(from);
      if (to) (filter.date as Record<string, string>).$lte = String(to);
    }

    const records = await DailyPerformance.find(filter)
      .sort({ date: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const totalCount = await DailyPerformance.countDocuments(filter);

    return res.json({ records, totalCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch history';
    return res.status(500).json({ message });
  }
});

// ── 4. GET /api/daily-performance/weekly ───────────────────────────────────────
router.get('/weekly', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let menteeId = await resolveMenteeId(req);
    if (!menteeId && (req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR') && req.query.menteeId) {
      menteeId = String(req.query.menteeId);
    }
    if (!menteeId) {
      return res.status(403).json({ message: 'Mentee profile not found.' });
    }

    // Last 7 days dates
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const records = await DailyPerformance.find({
      menteeId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();

    const daysSubmitted = records.length;
    const totalStudyMin = records.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const totalQuranRuku = records.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const totalQuranAyat = records.reduce((acc, r) => acc + (r.quran?.ayat || 0), 0);
    const totalQuranPages = records.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const totalReadingMin = records.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const avgRating = daysSubmitted > 0
      ? Number((records.reduce((acc, r) => acc + (r.dayRating || 0), 0) / daysSubmitted).toFixed(1))
      : 0;

    return res.json({
      summary: {
        startDate,
        endDate,
        daysSubmitted,
        totalStudyMinutes: totalStudyMin,
        totalStudyHoursFormatted: `${Math.floor(totalStudyMin / 60)}h ${totalStudyMin % 60}m`,
        quran: {
          ruku: totalQuranRuku,
          ayat: totalQuranAyat,
          pages: totalQuranPages,
        },
        totalReadingMinutes: totalReadingMin,
        averageDayRating: avgRating,
      },
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch weekly summary';
    return res.status(500).json({ message });
  }
});

// ── 5. GET /api/daily-performance/monthly ──────────────────────────────────────
router.get('/monthly', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let menteeId = await resolveMenteeId(req);
    if (!menteeId && (req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR') && req.query.menteeId) {
      menteeId = String(req.query.menteeId);
    }
    if (!menteeId) {
      return res.status(403).json({ message: 'Mentee profile not found.' });
    }

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${year}-${month}-01`;
    const today = getTodayString();

    const records = await DailyPerformance.find({
      menteeId,
      date: { $gte: startOfMonth, $lte: today },
    })
      .sort({ date: 1 })
      .lean();

    const daysSubmitted = records.length;
    const totalStudyMin = records.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const totalQuranRuku = records.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const totalQuranAyat = records.reduce((acc, r) => acc + (r.quran?.ayat || 0), 0);
    const totalQuranPages = records.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const totalReadingMin = records.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const avgRating = daysSubmitted > 0
      ? Number((records.reduce((acc, r) => acc + (r.dayRating || 0), 0) / daysSubmitted).toFixed(1))
      : 0;

    return res.json({
      summary: {
        month: `${year}-${month}`,
        daysSubmitted,
        totalStudyMinutes: totalStudyMin,
        totalStudyHoursFormatted: `${Math.floor(totalStudyMin / 60)}h ${totalStudyMin % 60}m`,
        quran: {
          ruku: totalQuranRuku,
          ayat: totalQuranAyat,
          pages: totalQuranPages,
        },
        totalReadingMinutes: totalReadingMin,
        averageDayRating: avgRating,
      },
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch monthly summary';
    return res.status(500).json({ message });
  }
});

// ── 6. PUT /api/daily-performance/:id (Update entry) ──────────────────────────
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updatePerformanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid data provided.', errors: parsed.error.issues });
    }

    const record = await DailyPerformance.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: 'Performance record not found.' });
    }

    // Role check: Mentee can only update their own record; admin can update any
    if (req.user?.role === 'MENTEE') {
      const menteeId = await resolveMenteeId(req);
      if (record.menteeId !== menteeId) {
        return res.status(403).json({ message: 'You can only edit your own performance records.' });
      }
    }

    if (parsed.data.studyMinutes !== undefined) record.studyMinutes = parsed.data.studyMinutes;
    if (parsed.data.quran !== undefined) {
      record.quran = {
        ruku: parsed.data.quran.ruku ?? record.quran.ruku,
        ayat: parsed.data.quran.ayat ?? record.quran.ayat,
        pages: parsed.data.quran.pages ?? record.quran.pages,
      };
    }
    if (parsed.data.readingMinutes !== undefined) record.readingMinutes = parsed.data.readingMinutes;
    if (parsed.data.dayRating !== undefined) record.dayRating = parsed.data.dayRating;
    if (parsed.data.dailyReflection !== undefined) record.dailyReflection = parsed.data.dailyReflection.trim();
    if (parsed.data.facedDifficulty !== undefined) {
      record.facedDifficulty = parsed.data.facedDifficulty;
      record.difficultyNote = parsed.data.facedDifficulty ? parsed.data.difficultyNote?.trim() : undefined;
    }
    if (parsed.data.needsMentorHelp !== undefined) {
      record.needsMentorHelp = parsed.data.needsMentorHelp;
      record.mentorHelpNote = parsed.data.needsMentorHelp ? parsed.data.mentorHelpNote?.trim() : undefined;
    }

    await record.save();

    return res.json({
      message: 'Daily progress updated successfully.',
      record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update record';
    return res.status(500).json({ message });
  }
});

// ── 7. GET /api/mentor/mentees/:menteeId/performance ──────────────────────────
router.get(['/mentor-view/:menteeId', '/mentor/mentees/:menteeId/performance', '/mentees/:menteeId/performance'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const menteeId = Array.isArray(req.params.menteeId) ? req.params.menteeId[0] : String(req.params.menteeId);

    if (req.user?.role === 'MENTOR') {
      const allowed = await verifyMentorAccess(req.user.id, menteeId);
      if (!allowed) {
        return res.status(403).json({ message: 'You are not assigned to this mentee.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const todayDate = getTodayString();
    const todayRecord = await DailyPerformance.findOne({ menteeId, date: todayDate }).lean();

    // 7 days dates
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }

    const weekRecords = await DailyPerformance.find({
      menteeId,
      date: { $gte: dates[0], $lte: dates[dates.length - 1] },
    })
      .sort({ date: -1 })
      .lean();

    const allHistory = await DailyPerformance.find({ menteeId })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const weekDaysSubmitted = weekRecords.length;
    const weekTotalStudyMin = weekRecords.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const weekTotalQuranRuku = weekRecords.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const weekTotalQuranAyat = weekRecords.reduce((acc, r) => acc + (r.quran?.ayat || 0), 0);
    const weekTotalQuranPages = weekRecords.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const weekTotalReadingMin = weekRecords.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const weekAvgRating = weekDaysSubmitted > 0
      ? Number((weekRecords.reduce((acc, r) => acc + (r.dayRating || 0), 0) / weekDaysSubmitted).toFixed(1))
      : 0;

    return res.json({
      today: todayRecord ?? null,
      weekly: {
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        daysSubmitted: weekDaysSubmitted,
        totalStudyMinutes: weekTotalStudyMin,
        totalStudyHoursFormatted: `${Math.floor(weekTotalStudyMin / 60)}h ${weekTotalStudyMin % 60}m`,
        quran: {
          ruku: weekTotalQuranRuku,
          ayat: weekTotalQuranAyat,
          pages: weekTotalQuranPages,
        },
        totalReadingMinutes: weekTotalReadingMin,
        averageDayRating: weekAvgRating,
      },
      history: allHistory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch mentee performance';
    return res.status(500).json({ message });
  }
});

// ── 8. GET /api/mentor/mentees/:menteeId/performance/analytics ─────────────────
router.get(['/mentor-view/:menteeId/analytics', '/mentor/mentees/:menteeId/performance/analytics', '/mentees/:menteeId/performance/analytics'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const menteeId = Array.isArray(req.params.menteeId) ? req.params.menteeId[0] : String(req.params.menteeId);

    if (req.user?.role === 'MENTOR') {
      const allowed = await verifyMentorAccess(req.user.id, menteeId);
      if (!allowed) {
        return res.status(403).json({ message: 'You are not assigned to this mentee.' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Generate dates for last 30 days
    const last30Days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      last30Days.push(`${year}-${month}-${day}`);
    }

    const last7Days = last30Days.slice(23); // last 7 days

    const records30 = await DailyPerformance.find({
      menteeId,
      date: { $gte: last30Days[0], $lte: last30Days[last30Days.length - 1] },
    }).lean();

    const recordMap = new Map<string, typeof records30[0]>();
    for (const r of records30) {
      recordMap.set(r.date, r);
    }

    // Build day-by-day series for 7 days
    const last7DaysData = last7Days.map((date) => {
      const r = recordMap.get(date);
      return {
        date,
        studyMinutes: r?.studyMinutes ?? 0,
        studyHours: Number(((r?.studyMinutes ?? 0) / 60).toFixed(1)),
        quranRuku: r?.quran?.ruku ?? 0,
        quranAyat: r?.quran?.ayat ?? 0,
        quranPages: r?.quran?.pages ?? 0,
        readingMinutes: r?.readingMinutes ?? 0,
        dayRating: r?.dayRating ?? 0,
      };
    });

    // Build day-by-day series for 30 days
    const last30DaysData = last30Days.map((date) => {
      const r = recordMap.get(date);
      return {
        date,
        studyMinutes: r?.studyMinutes ?? 0,
        studyHours: Number(((r?.studyMinutes ?? 0) / 60).toFixed(1)),
        quranRuku: r?.quran?.ruku ?? 0,
        readingMinutes: r?.readingMinutes ?? 0,
        dayRating: r?.dayRating ?? 0,
      };
    });

    // Rating distribution
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of records30) {
      if (r.dayRating >= 1 && r.dayRating <= 5) {
        ratingDistribution[r.dayRating] = (ratingDistribution[r.dayRating] || 0) + 1;
      }
    }

    // 7-day stats
    const records7 = records30.filter((r) => last7Days.includes(r.date));
    const daysSubmitted7 = records7.length;
    const studyDaysCount7 = records7.filter((r) => r.studyMinutes > 0).length;
    const quranDaysCount7 = records7.filter((r) => (r.quran?.ruku || 0) > 0 || (r.quran?.ayat || 0) > 0 || (r.quran?.pages || 0) > 0).length;
    const totalReading7 = records7.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const avgReading7 = daysSubmitted7 > 0 ? Math.round(totalReading7 / 7) : 0;
    const avgRating7 = daysSubmitted7 > 0
      ? Number((records7.reduce((acc, r) => acc + (r.dayRating || 0), 0) / daysSubmitted7).toFixed(1))
      : 0;

    // Descriptive trend statements (Requirement 12: strictly descriptive, not psychological)
    const insights: string[] = [
      `Study consistency: Study time has been recorded on ${studyDaysCount7} of the last 7 days.`,
      `Quran reading: Quran reading was recorded on ${quranDaysCount7} of the last 7 days.`,
      `Reading habits: Average reading time this week: ${avgReading7} minutes/day across all 7 days.`,
      `Overall day experience: Average day rating this week: ${avgRating7 > 0 ? avgRating7 : '—'}/5.`,
    ];

    // Totals & Averages
    const totalStudy30 = records30.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const totalQuranRuku30 = records30.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const totalQuranAyat30 = records30.reduce((acc, r) => acc + (r.quran?.ayat || 0), 0);
    const totalQuranPages30 = records30.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const totalReading30 = records30.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const avgDailyStudy30 = records30.length > 0 ? Math.round(totalStudy30 / records30.length) : 0;
    const avgDailyQuranPages30 = records30.length > 0 ? Number((totalQuranPages30 / records30.length).toFixed(1)) : 0;
    const avgDailyReading30 = records30.length > 0 ? Math.round(totalReading30 / records30.length) : 0;

    const todayR = recordMap.get(last30Days[last30Days.length - 1]);

    return res.json({
      study: {
        todayMinutes: todayR?.studyMinutes ?? 0,
        weeklyMinutes: records7.reduce((acc, r) => acc + (r.studyMinutes || 0), 0),
        monthlyMinutes: totalStudy30,
        averageDailyMinutes: avgDailyStudy30,
        charts: {
          last7Days: last7DaysData.map((d) => ({ date: d.date, hours: d.studyHours, minutes: d.studyMinutes })),
          last30Days: last30DaysData.map((d) => ({ date: d.date, hours: d.studyHours, minutes: d.studyMinutes })),
        },
      },
      quran: {
        totalRuku: totalQuranRuku30,
        totalAyat: totalQuranAyat30,
        totalPages: totalQuranPages30,
        averageDailyPages: avgDailyQuranPages30,
        charts: {
          last7Days: last7DaysData.map((d) => ({
            date: d.date,
            ruku: d.quranRuku,
            ayat: d.quranAyat,
            pages: d.quranPages,
          })),
        },
      },
      reading: {
        totalMinutes: totalReading30,
        weeklyMinutes: totalReading7,
        averageDailyMinutes: avgDailyReading30,
        charts: {
          last7Days: last7DaysData.map((d) => ({ date: d.date, minutes: d.readingMinutes })),
        },
      },
      overallDay: {
        averageRating: avgRating7,
        ratingDistribution,
      },
      mentorInsights: insights,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate analytics';
    return res.status(500).json({ message });
  }
});

// ── 9. POST /api/mentor/mentees/:menteeId/performance/ai-insights ──────────────
router.post(
  ['/mentor-view/:menteeId/ai-insights', '/mentor/mentees/:menteeId/performance/ai-insights', '/mentees/:menteeId/performance/ai-insights'],
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const menteeId = Array.isArray(req.params.menteeId) ? req.params.menteeId[0] : String(req.params.menteeId);

      if (req.user?.role === 'MENTOR') {
        const allowed = await verifyMentorAccess(req.user.id, menteeId);
        if (!allowed) {
          return res.status(403).json({ message: 'You are not assigned to this mentee.' });
        }
      } else if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Access denied.' });
      }

      const mentee = await Mentee.findById(menteeId).lean();
      if (!mentee) {
        return res.status(404).json({ message: 'Mentee not found.' });
      }

      // Get last 7 days records
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const startDate = d.toISOString().slice(0, 10);

      const records = await DailyPerformance.find({
        menteeId,
        date: { $gte: startDate },
      })
        .sort({ date: 1 })
        .lean();

      if (records.length === 0) {
        return res.json({
          weeklySummary: `No daily performance records have been submitted for ${mentee.name} in the past 7 days. Once the mentee logs daily entries, AI insights will summarize their learning consistency and accomplishments.`,
          discussionPoints: [
            'Encourage the mentee to begin recording their daily study and reading habits.',
            'Discuss how tracking daily progress helps celebrate achievements and identify areas for support.',
          ],
        });
      }

      const service = createDailyPerformanceAiService();
      const insights = await service.generateInsights({
        menteeName: mentee.name,
        records: records.map((r) => ({
          date: r.date,
          studyMinutes: r.studyMinutes,
          quran: r.quran,
          readingMinutes: r.readingMinutes,
          dayRating: r.dayRating,
          dailyReflection: r.dailyReflection,
          facedDifficulty: r.facedDifficulty,
          difficultyNote: r.difficultyNote,
          needsMentorHelp: r.needsMentorHelp,
          mentorHelpNote: r.mentorHelpNote,
        })),
      });

      return res.json(insights);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate AI insights';
      return res.status(500).json({ message });
    }
  },
);

// ── 9b. POST /api/daily-performance/:id/ai-insights ───────────────────────────
router.post('/:id/ai-insights', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const record = await DailyPerformance.findById(req.params.id).lean();
    if (!record) {
      return res.status(404).json({ message: 'Performance record not found.' });
    }

    const mentee = await Mentee.findById(record.menteeId).lean();
    if (!mentee) {
      return res.status(404).json({ message: 'Mentee not found.' });
    }

    if (req.user?.role === 'MENTOR') {
      const allowed = await verifyMentorAccess(req.user.id, record.menteeId);
      if (!allowed) {
        return res.status(403).json({ message: 'You are not assigned to this mentee.' });
      }
    }

    const service = createDailyPerformanceAiService();
    const insights = await service.generateInsights({
      menteeName: mentee.name,
      records: [record],
    });

    return res.json(insights);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate AI insights';
    return res.status(500).json({ message });
  }
});

// ── 10. GET /api/admin/performance/analytics (Aggregated Admin Analytics) ──────
router.get(['/admin/analytics', '/admin/performance/analytics'], requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { mentorId, menteeId, standard, from, to } = req.query;

    // Filter mentees
    const menteeFilter: Record<string, unknown> = { status: 'active' };
    if (standard) menteeFilter.standard = standard;

    let targetMenteeIds: string[] = [];

    if (mentorId) {
      const assignments = await Mentorship.find({ mentorId: String(mentorId), status: 'active' }).lean();
      targetMenteeIds = assignments.map((a) => a.menteeId);
    }

    if (menteeId) {
      targetMenteeIds = [String(menteeId)];
    }

    if (targetMenteeIds.length > 0) {
      menteeFilter._id = { $in: targetMenteeIds };
    }

    const mentees = await Mentee.find(menteeFilter).lean();
    const totalActiveMentees = mentees.length;
    const activeMenteeIds = mentees.map((m) => String(m._id));

    // Performance record filter
    const perfFilter: Record<string, unknown> = {
      menteeId: { $in: activeMenteeIds },
    };

    if (from || to) {
      perfFilter.date = {};
      if (from) (perfFilter.date as Record<string, string>).$gte = String(from);
      if (to) (perfFilter.date as Record<string, string>).$lte = String(to);
    }

    const allRecords = await DailyPerformance.find(perfFilter).lean();

    const todayDate = getTodayString();
    const dailySubmissions = allRecords.filter((r) => r.date === todayDate).length;

    // Weekly date window
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const weekAgoStr = d.toISOString().slice(0, 10);
    const weeklySubmissions = allRecords.filter((r) => r.date >= weekAgoStr).length;

    // Total possible submissions this week: totalActiveMentees * 7
    const possibleWeekly = totalActiveMentees * 7;
    const submissionRate = possibleWeekly > 0 ? Math.min(100, Math.round((weeklySubmissions / possibleWeekly) * 100)) : 0;

    // Aggregates across records
    const recordCount = allRecords.length;
    const totalStudyMin = allRecords.reduce((acc, r) => acc + (r.studyMinutes || 0), 0);
    const totalQuranRuku = allRecords.reduce((acc, r) => acc + (r.quran?.ruku || 0), 0);
    const totalQuranPages = allRecords.reduce((acc, r) => acc + (r.quran?.pages || 0), 0);
    const totalReadingMin = allRecords.reduce((acc, r) => acc + (r.readingMinutes || 0), 0);
    const totalRating = allRecords.reduce((acc, r) => acc + (r.dayRating || 0), 0);

    const avgStudyMinutes = recordCount > 0 ? Math.round(totalStudyMin / recordCount) : 0;
    const avgQuranPages = recordCount > 0 ? Number((totalQuranPages / recordCount).toFixed(1)) : 0;
    const avgReadingMinutes = recordCount > 0 ? Math.round(totalReadingMin / recordCount) : 0;
    const avgDayRating = recordCount > 0 ? Number((totalRating / recordCount).toFixed(1)) : 0;

    return res.json({
      summary: {
        totalActiveMentees,
        dailySubmissions,
        weeklySubmissions,
        submissionRate,
        averageStudyMinutes: avgStudyMinutes,
        averageStudyHoursFormatted: `${Math.floor(avgStudyMinutes / 60)}h ${avgStudyMinutes % 60}m`,
        averageQuranPages: avgQuranPages,
        totalQuranRuku,
        averageReadingMinutes: avgReadingMinutes,
        averageDayRating: avgDayRating,
      },
      standards: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch admin performance analytics';
    return res.status(500).json({ message });
  }
});

export default router;
