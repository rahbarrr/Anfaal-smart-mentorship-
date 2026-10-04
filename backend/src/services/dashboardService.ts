import { Call } from '../models/Call.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { getCachedJson, setCachedJson } from './cacheService.js';

export async function getDashboardSummary(): Promise<Record<string, unknown>> {
  const cached = await getCachedJson<Record<string, unknown>>('dashboard:summary');
  if (cached) return cached;
  const [
    mentorCount,
    menteeCount,
    pendingReviewCalls,
    approvedCalls,
    callsProcessedByAi,
    failedJobs,
  ] = await Promise.all([
    Mentor.countDocuments({ status: 'active' }),
    Mentee.countDocuments({ status: 'active' }),
    Call.countDocuments({ reviewStatus: 'Pending Review' }),
    Call.countDocuments({ reviewStatus: 'Approved' }),
    Call.countDocuments({ aiStatus: 'completed' }),
    CallProcessingJob.countDocuments({ status: 'FAILED' }),
  ]);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const todayStr = new Date().toISOString().split('T')[0];

  const [callsThisMonth, dailySubmissionsToday, recentCallsDocs, recentPerformanceDocs] = await Promise.all([
    Call.countDocuments({ createdAt: { $gte: thisMonth } }),
    DailyPerformance.countDocuments({ date: todayStr }),
    Call.find().sort({ createdAt: -1 }).limit(5).lean(),
    DailyPerformance.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const recentMenteeIds = [...new Set([...recentCallsDocs.map((c) => c.menteeId), ...recentPerformanceDocs.map((p) => p.menteeId)])];
  const recentMentorIds = [...new Set(recentCallsDocs.map((c) => c.mentorId))];
  const [recentMentees, recentMentors, directUsers] = await Promise.all([
    Mentee.find({ _id: { $in: recentMenteeIds } }, { name: 1 }).lean(),
    Mentor.find({ _id: { $in: recentMentorIds } }, { userId: 1 }).lean(),
    User.find({ _id: { $in: recentMentorIds } }, { name: 1 }).lean(),
  ]);
  const menteeNames = new Map(recentMentees.map((m) => [String(m._id), m.name]));
  const mentorUsers = await User.find({ _id: { $in: recentMentors.map((m) => m.userId) } }, { name: 1 }).lean();
  const mentorNames = new Map<string, string>();
  recentMentors.forEach((m) => mentorNames.set(String(m._id), mentorUsers.find((u) => String(u._id) === String(m.userId))?.name || 'Mentor'));
  directUsers.forEach((u) => mentorNames.set(String(u._id), u.name));

  const recentCalls = recentCallsDocs.map((c) => {
      return {
        id: String(c._id),
        date: c.date,
        uploadedAt: c.uploadedAt || c.createdAt || c.date,
        duration: c.duration,
        mentorName: mentorNames.get(String(c.mentorId)) || 'Mentor',
        menteeName: menteeNames.get(String(c.menteeId)) || 'Mentee',
        reviewStatus: c.reviewStatus,
        aiStatus: c.aiStatus,
        summary: c.aiSummary?.shortSummary || c.summary || 'Summary processing…',
        hasRecording: Boolean(c.recordingUrl || c.recording?.url),
      };
    });

  // Resolve mentee names for recent performance
  const recentProgress = recentPerformanceDocs.map((p) => {
      return {
        id: String(p._id),
        menteeId: p.menteeId,
        menteeName: menteeNames.get(String(p.menteeId)) || 'Mentee',
        date: p.date,
        submittedAt: p.submittedAt || p.createdAt,
        updatedAt: p.updatedAt,
        studyMinutes: p.studyMinutes,
        quranRuku: p.quran?.ruku || 0,
        dayRating: p.dayRating,
        needsMentorHelp: p.needsMentorHelp,
        mentorHelpNote: p.mentorHelpNote,
      };
    });

  // Build factual Attention Required indicators
  const attentionItems: Array<{ type: string; title: string; description: string; link: string }> = [];
  if (pendingReviewCalls > 0) {
    attentionItems.push({
      type: 'REVIEW',
      title: `${pendingReviewCalls} Call${pendingReviewCalls > 1 ? 's' : ''} Awaiting Review`,
      description: 'Mentorship sessions completed with AI summaries ready for official sign-off.',
      link: '/admin/reviews',
    });
  }
  if (failedJobs > 0) {
    attentionItems.push({
      type: 'FAILED_JOB',
      title: `${failedJobs} Processing Job${failedJobs > 1 ? 's' : ''} Encountered Issues`,
      description: 'Transcription or summary jobs flagged for system attention.',
      link: '/admin/calls',
    });
  }

  const helpRequests = await DailyPerformance.find({ needsMentorHelp: true }).sort({ createdAt: -1 }).limit(3).lean();
  const helpMentees = await Mentee.find({ _id: { $in: helpRequests.map((h) => h.menteeId) } }, { name: 1 }).lean();
  const helpNames = new Map(helpMentees.map((m) => [String(m._id), m.name]));
  for (const h of helpRequests) {
    attentionItems.push({
      type: 'NEEDS_HELP',
      title: `${helpNames.get(String(h.menteeId)) || 'Mentee'} Requested Mentor Assistance`,
      description: h.mentorHelpNote || 'Student flagged a difficulty in today’s daily reflection.',
      link: `/admin/performance`,
    });
  }

  const result = {
    totalMentors: mentorCount,
    totalMentees: menteeCount,
    callsThisMonth,
    callsPending: pendingReviewCalls,
    callsCompleted: approvedCalls,
    callsProcessedByAi,
    dailySubmissionsToday,
    recentCalls,
    recentProgress,
    attentionItems,
  };
  await setCachedJson('dashboard:summary', result, 30);
  return result;
}
