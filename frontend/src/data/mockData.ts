export const dashboardCards = [
  { label: 'Total Mentees', value: '28', change: '+4 this month', tone: 'info' },
  { label: 'Calls This Month', value: '18', change: '+3 vs last month', tone: 'success' },
  { label: 'Calls Pending Submission', value: '6', change: '2 urgent', tone: 'warning' },
  { label: 'Last Call', value: 'Sep 12', change: '42 mins', tone: 'info' },
];

export const recentCalls: any[] = [
  {
    id: '1',
    mentee: 'Aisha Khan',
    date: '2026-09-12',
    duration: '42 min',
    status: 'Completed',
    summary: 'Improved reading habits and created a study plan for foundational subjects.',
    action: 'View',
  },
  {
    id: '2',
    mentee: 'Nadia Hussain',
    date: '2026-09-11',
    duration: '36 min',
    status: 'Pending Review',
    summary: 'Discussed progress on assignments and presentation confidence.',
    action: 'Review',
  },
  {
    id: '3',
    mentee: 'Hassan Ali',
    date: '2026-09-09',
    duration: '28 min',
    status: 'Processing',
    summary: 'AI summary is generating the final call notes.',
    action: 'Open',
  },
];

export const menteeList = [
  {
    id: 'm1',
    name: 'Aisha Khan',
    standard: 'Class 8',
    age: '13',
    status: 'Active',
    assignedMentor: 'Rahul Sharma',
    lastCallDate: 'Sep 12, 2026',
    totalCalls: 8,
    nextFollowUp: 'Sep 20, 2026',
  },
  {
    id: 'm2',
    name: 'Nadia Hussain',
    standard: 'Class 9',
    age: '14',
    status: 'At Risk',
    assignedMentor: 'Rahul Sharma',
    lastCallDate: 'Sep 11, 2026',
    totalCalls: 6,
    nextFollowUp: 'Sep 18, 2026',
  },
  {
    id: 'm3',
    name: 'Hassan Ali',
    standard: 'Class 7',
    age: '12',
    status: 'Active',
    assignedMentor: 'Priya Nair',
    lastCallDate: 'Sep 9, 2026',
    totalCalls: 11,
    nextFollowUp: 'Sep 24, 2026',
  },
];

export const aiSummaryExample = {
  shortSummary: 'The student showed steady improvement in reading habits and study consistency, while also discussing confidence during class participation.',
  keyDiscussionPoints: ['Reviewed academic progress', 'Discussed response to revision routine', 'Identified focus areas for improvement'],
  studentConcerns: ['Lower confidence during presentations', 'Difficulty staying consistent with revision'],
  actionItems: ['Complete the weekly reading goals', 'Practice a short presentation before next meeting'],
  followUpRecommendations: ['Share a revised timetable', 'Check progress after one week'],
  topicsDiscussed: ['Academic progress', 'Study habits', 'Confidence building'],
};
