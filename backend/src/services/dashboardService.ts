import { Call } from '../models/Call.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';

export async function getDashboardSummary() {
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

  // Resolve mentor and mentee names for recent calls
  const recentCalls = await Promise.all(
    recentCallsDocs.map(async (c) => {
      const mentee = await Mentee.findById(c.menteeId).lean();
      let mentorName = 'Mentor';
      const mentorProfile = await Mentor.findById(c.mentorId).lean();
      if (mentorProfile) {
        const u = await User.findById(mentorProfile.userId).lean();
        if (u) mentorName = u.name;
      } else {
        const u = await User.findById(c.mentorId).lean();
        if (u) mentorName = u.name;
      }
      return {
        id: String(c._id),
        date: c.date,
        duration: c.duration,
        mentorName,
        menteeName: mentee?.name || 'Mentee',
        reviewStatus: c.reviewStatus,
        aiStatus: c.aiStatus,
        summary: c.aiSummary?.shortSummary || c.summary || 'Summary processing…',
        hasRecording: Boolean(c.recordingUrl || c.recording?.url),
      };
    }),
  );

  // Resolve mentee names for recent performance
  const recentProgress = await Promise.all(
    recentPerformanceDocs.map(async (p) => {
      const mentee = await Mentee.findById(p.menteeId).lean();
      return {
        id: String(p._id),
        menteeId: p.menteeId,
        menteeName: mentee?.name || 'Mentee',
        date: p.date,
        studyMinutes: p.studyMinutes,
        quranRuku: p.quran?.ruku || 0,
        dayRating: p.dayRating,
        needsMentorHelp: p.needsMentorHelp,
        mentorHelpNote: p.mentorHelpNote,
      };
    }),
  );

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
  for (const h of helpRequests) {
    const mentee = await Mentee.findById(h.menteeId).lean();
    attentionItems.push({
      type: 'NEEDS_HELP',
      title: `${mentee?.name || 'Mentee'} Requested Mentor Assistance`,
      description: h.mentorHelpNote || 'Student flagged a difficulty in today’s daily reflection.',
      link: `/admin/performance`,
    });
  }

  return {
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
}
