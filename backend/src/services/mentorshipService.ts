export type AssignmentStatus = 'active' | 'archived';

export type AssignmentSummaryItem = {
  mentorName: string;
  menteeName: string;
  status: AssignmentStatus;
};

export type MentorAssignmentAggregate = {
  mentorName: string;
  menteeCount: number;
  activeMentees: number;
};

export type AssignmentSummary = {
  totalAssignments: number;
  activeAssignments: number;
  byMentor: MentorAssignmentAggregate[];
};

export function summarizeAssignments(assignments: AssignmentSummaryItem[]): AssignmentSummary {
  const grouped = new Map<string, { mentorName: string; menteeCount: number; activeMentees: number }>();

  for (const assignment of assignments) {
    const current = grouped.get(assignment.mentorName) ?? {
      mentorName: assignment.mentorName,
      menteeCount: 0,
      activeMentees: 0,
    };

    current.menteeCount += 1;
    if (assignment.status === 'active') {
      current.activeMentees += 1;
    }

    grouped.set(assignment.mentorName, current);
  }

  return {
    totalAssignments: assignments.length,
    activeAssignments: assignments.filter((assignment) => assignment.status === 'active').length,
    byMentor: [...grouped.values()].sort((a, b) => b.menteeCount - a.menteeCount),
  };
}
