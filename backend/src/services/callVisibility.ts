/**
 * Keep call records restorable in Bin while hiding individually deleted parts
 * from normal API consumers.
 */
export function maskDeletedCallParts<T extends Record<string, any>>(call: T): T {
  const safeCall = { ...call } as T;

  if (safeCall.recordingDeletedAt) {
    delete safeCall.recording;
    delete safeCall.recordingUrl;
  }

  if (safeCall.summaryDeletedAt) {
    delete safeCall.summary;
    delete safeCall.summaryVersions;
    delete safeCall.aiSummary;
  }

  if (safeCall.intelligenceDeletedAt) {
    delete safeCall.keyDiscussionPoints;
    delete safeCall.studentConcerns;
    delete safeCall.actionItems;
    delete safeCall.followUpRecommendations;
    delete safeCall.topicsDiscussed;
    delete safeCall.aiSummary;
  }

  return safeCall;
}
