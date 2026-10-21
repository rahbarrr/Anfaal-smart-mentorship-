import 'server-only';
import { getFirebaseAdmin } from '../firebase/admin';
import { getStorageService } from './storageService';
import { createTranscriptionService } from './transcriptionService';
import { createAiSummaryService } from './aiSummaryService';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface ProcessCallParams {
  callId: string;
  mentorNotes?: string;
  skipTranscription?: boolean;
}

export async function processCallPipeline({ callId, mentorNotes, skipTranscription }: ProcessCallParams) {
  const { adminDb } = getFirebaseAdmin();
  const callRef = adminDb.collection('calls').doc(callId);
  const callDoc = await callRef.get();

  if (!callDoc.exists) {
    throw new Error(`Call record ${callId} was not found in Firestore.`);
  }

  const callData = callDoc.data()!;
  console.info(`[CallPipeline] Starting processing for callId=${callId}`);

  // Mark processing
  await callRef.update({
    processingStatus: 'processing',
    processingError: null,
    'timings.processingStartedAt': Timestamp.now(),
  });

  try {
    let transcriptText = callData.transcript || callData.transcription?.text || '';
    let segments = callData.transcription?.segments || [];
    let transcriptionDuration = callData.transcription?.duration || callData.duration || 0;

    const storageKey = callData.recording?.storageKey || callData.storageKey;
    const hasAudio = Boolean(storageKey && callData.hasRecording !== false);

    // ── Stage 1: Transcription ───────────────────────────────────────────────
    if (!skipTranscription && hasAudio && (!transcriptText || callData.transcription?.status !== 'COMPLETED')) {
      console.info(`[CallPipeline] Stage 1: Loading audio from storage: ${storageKey}`);
      const storageService = getStorageService();
      const audioBuffer = await storageService.getObjectBuffer(storageKey);

      console.info(`[CallPipeline] Audio loaded (${audioBuffer.length} bytes). Transcribing via Whisper...`);
      const transcriptionService = createTranscriptionService();
      const transcriptionResult = await transcriptionService.transcribe({
        buffer: audioBuffer,
        originalname: callData.recording?.fileName || 'recording.mp3',
        mimetype: callData.recording?.mimeType || 'audio/mpeg',
      });

      transcriptText = transcriptionResult.text;
      segments = transcriptionResult.segments;
      transcriptionDuration = transcriptionResult.duration || callData.duration;

      await callRef.update({
        transcript: transcriptText,
        transcription: {
          status: 'COMPLETED',
          text: transcriptText,
          segments,
          duration: transcriptionDuration,
          language: transcriptionResult.language || 'en',
          provider: transcriptionResult.provider,
          createdAt: Timestamp.now(),
        },
      });
      console.info(`[CallPipeline] Stage 1 complete. Transcript length: ${transcriptText.length} chars.`);
    }

    // ── Stage 2: AI Summarization ───────────────────────────────────────────
    console.info(`[CallPipeline] Stage 2: Generating AI Summary...`);
    const aiSummaryService = createAiSummaryService();
    const summaryResult = await aiSummaryService.summarize({
      transcript: transcriptText,
      mentorNotes: mentorNotes || callData.mentorNotes,
      metadata: {
        mentorName: callData.mentorName || 'Mentor',
        menteeName: callData.menteeName || 'Mentee',
        date: callData.date instanceof Timestamp ? callData.date.toDate().toISOString() : String(callData.date || ''),
        duration: transcriptionDuration,
      },
    });

    const versionEntry = {
      version: 1,
      type: 'AI',
      content: summaryResult,
      timestamp: Timestamp.now(),
      author: 'system',
    };

    await callRef.update({
      summary: summaryResult.shortSummary,
      keyDiscussionPoints: summaryResult.keyDiscussionPoints,
      studentConcerns: summaryResult.studentConcerns,
      actionItems: summaryResult.actionItems,
      followUpRecommendations: summaryResult.followUpRecommendations,
      topicsDiscussed: summaryResult.topicsDiscussed,
      aiStatus: 'completed',
      aiSummary: {
        status: 'COMPLETED',
        shortSummary: summaryResult.shortSummary,
        keyDiscussionPoints: summaryResult.keyDiscussionPoints,
        academicProgress: summaryResult.academicProgress,
        personalDevelopment: summaryResult.personalDevelopment,
        challenges: summaryResult.challenges,
        achievements: summaryResult.achievements,
        actionItems: summaryResult.actionItems,
        mentorCommitments: summaryResult.mentorCommitments,
        menteeCommitments: summaryResult.menteeCommitments,
        followUpTopics: summaryResult.followUpTopics,
        topicsDiscussed: summaryResult.topicsDiscussed,
        generatedAt: Timestamp.now(),
      },
      summaryVersions: FieldValue.arrayUnion(versionEntry),
      processingStatus: 'completed',
      reviewStatus: callData.reviewStatus || 'Pending Review',
      'timings.processingCompletedAt': Timestamp.now(),
    });

    console.info(`[CallPipeline] Stage 2 complete. Summary generated.`);

    // ── Stage 3: Mentee Metadata Update ─────────────────────────────────────
    if (callData.menteeId) {
      try {
        const menteeRef = adminDb.collection('mentees').doc(String(callData.menteeId));
        await menteeRef.set(
          {
            lastCallDate: callData.date instanceof Timestamp ? callData.date.toDate().toLocaleDateString('en-CA') : String(callData.date || ''),
            totalCalls: FieldValue.increment(1),
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );
      } catch (menteeErr) {
        console.warn(`[CallPipeline] Non-fatal mentee update warning:`, menteeErr);
      }
    }

    // ── Stage 4: In-App Notification ────────────────────────────────────────
    try {
      if (callData.mentorId) {
        await adminDb.collection('notifications').add({
          userId: String(callData.mentorId),
          title: 'Call Processing Complete',
          message: `AI summary and transcript are ready for your call with ${callData.menteeName || 'your mentee'}.`,
          type: 'call_processed',
          read: false,
          callId,
          createdAt: Timestamp.now(),
        });
      }
    } catch (notifErr) {
      console.warn(`[CallPipeline] Non-fatal notification error:`, notifErr);
    }

    console.info(`[CallPipeline] Call ${callId} processing completed successfully.`);
    return { success: true, callId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CallPipeline] Processing failed for ${callId}:`, error);

    await callRef.update({
      processingStatus: 'failed',
      processingError: errorMsg,
      'timings.processingFailedAt': Timestamp.now(),
    });

    throw error;
  }
}
