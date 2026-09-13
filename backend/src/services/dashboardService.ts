import { Call } from '../models/Call.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';

export async function getDashboardSummary() {
  const [mentorCount, menteeCount, pendingCalls, completedCalls, activeMentors] = await Promise.all([
    Mentor.countDocuments({ status: 'active' }),
    Mentee.countDocuments({ status: 'active' }),
    Call.countDocuments({ reviewStatus: 'Pending Review' }),
    Call.countDocuments({ reviewStatus: 'Approved' }),
    Mentor.countDocuments({ status: 'active' }),
  ]);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const callsThisMonth = await Call.countDocuments({
    createdAt: { $gte: thisMonth },
  });

  return {
    totalMentors: mentorCount,
    totalMentees: menteeCount,
    callsThisMonth,
    callsPending: pendingCalls,
    callsCompleted: completedCalls,
    activeMentors,
  };
}
