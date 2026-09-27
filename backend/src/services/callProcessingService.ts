import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { createTranscriptionService } from './transcriptionService.js';
import { createAiSummaryService } from './aiSummaryService.js';

type StageStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Runs the full processing pipeline for a call recording:
 *   1. Transcription
 *   2. AI Summary
 *   3. Mark complete + ready for mentor review
 *
 * This is deliberately fire-and-forget (called without await from the route handler).
 */
export async function runCallProcessingPipeline(jobId: string, callId: string, fileBuffer?: Buffer, originalname?: string, mimetype?: string, mentorNotes?: string): Promise<void> {
  const updateJob = async (fields: Record<string, unknown>) => {
    await CallProcessingJob.findByIdAndUpdate(jobId, { $set: fields });
  };

  try {
    // ── Stage: Transcription ──────────────────────────────────────────────────
    await updateJob({
      stage: 'TRANSCRIPTION',
      status: 'PROCESSING',
      progress: 10,
      'stageStatus.audioProcessing': 'PROCESSING',
      'stageStatus.transcription': 'PENDING',
      startedAt: new Date(),
    });

    let transcriptText = '';
    let segments: Array<{ start: number; end: number; text: string; speaker?: string }> = [];
    let transcriptionDuration: number | undefined;

    if (fileBuffer && originalname) {
      try {
        await updateJob({
          progress: 20,
          'stageStatus.audioProcessing': 'COMPLETED',
          'stageStatus.transcription': 'PROCESSING',
        });

        const transcriptionService = createTranscriptionService();
        const result = await transcriptionService.transcribe({
          buffer: fileBuffer,
          originalname,
          mimetype: mimetype ?? 'audio/mpeg',
        });

        transcriptText = result.text;
        segments = result.segments ?? [];
        transcriptionDuration = result.duration;

        await Call.findByIdAndUpdate(callId, {
          $set: {
            transcript: transcriptText,
            'transcription.status': 'COMPLETED',
            'transcription.text': transcriptText,
            'transcription.segments': segments,
            'transcription.duration': transcriptionDuration,
            'transcription.provider': 'openai-whisper',
            'transcription.createdAt': new Date(),
          },
        });

        await updateJob({
          progress: 50,
          'stageStatus.transcription': 'COMPLETED',
        });
      } catch (transcriptionError) {
        console.error('[CallProcessing] Transcription failed:', transcriptionError instanceof Error ? transcriptionError.message : transcriptionError);

        await Call.findByIdAndUpdate(callId, {
          $set: { 'transcription.status': 'FAILED' },
        });

        await updateJob({
          progress: 50,
          'stageStatus.transcription': 'FAILED',
          // Don't fail the whole job — we can still summarise using mentorNotes
        });
      }
    } else {
      // No file — mark audio steps as skipped (COMPLETED with no transcript)
      await updateJob({
        progress: 50,
        'stageStatus.audioProcessing': 'COMPLETED',
        'stageStatus.transcription': 'COMPLETED',
      });
    }

    // ── Stage: AI Summary ─────────────────────────────────────────────────────
    await updateJob({
      stage: 'SUMMARY',
      progress: 55,
      'stageStatus.summary': 'PROCESSING',
    });

    try {
      const call = await Call.findById(callId).lean();
      const aiSummaryService = createAiSummaryService();
      const summaryResult = await aiSummaryService.summarize({
        transcript: transcriptText || (call?.transcript ?? ''),
        mentorNotes,
        metadata: {
          mentorId: call?.mentorId,
          date: call?.date?.toISOString(),
          duration: call?.duration,
        } as any,
      });

      // Build the version entry
      const versionEntry = {
        version: 1,
        type: 'AI',
        content: summaryResult,
        timestamp: new Date(),
        author: 'system',
      };

      await Call.findByIdAndUpdate(callId, {
        $set: {
          // Populate flat legacy fields (backwards compat)
          summary: summaryResult.shortSummary,
          keyDiscussionPoints: summaryResult.keyDiscussionPoints,
          studentConcerns: summaryResult.studentConcerns,
          actionItems: summaryResult.actionItems,
          followUpRecommendations: summaryResult.followUpRecommendations,
          topicsDiscussed: summaryResult.topicsDiscussed,
          aiStatus: 'completed',
          // Populate new structured fields
          'aiSummary.status': 'COMPLETED',
          'aiSummary.shortSummary': summaryResult.shortSummary,
          'aiSummary.keyDiscussionPoints': summaryResult.keyDiscussionPoints,
          'aiSummary.academicProgress': summaryResult.academicProgress,
          'aiSummary.personalDevelopment': summaryResult.personalDevelopment,
          'aiSummary.challenges': summaryResult.challenges,
          'aiSummary.achievements': summaryResult.achievements,
          'aiSummary.actionItems': summaryResult.actionItems,
          'aiSummary.mentorCommitments': summaryResult.mentorCommitments,
          'aiSummary.menteeCommitments': summaryResult.menteeCommitments,
          'aiSummary.followUpTopics': summaryResult.followUpTopics,
          'aiSummary.topicsDiscussed': summaryResult.topicsDiscussed,
          'aiSummary.generatedAt': new Date(),
          // Mentor review ready
          reviewStatus: 'Pending Review',
          'mentorReview.status': 'Pending Review',
        },
        $push: { summaryVersions: versionEntry },
      });

      await updateJob({
        stage: 'COMPLETE',
        status: 'COMPLETED',
        progress: 100,
        'stageStatus.summary': 'COMPLETED',
        'stageStatus.mentorReview': 'READY',
        completedAt: new Date(),
      });
    } catch (summaryError) {
      console.error('[CallProcessing] AI summary failed:', summaryError instanceof Error ? summaryError.message : summaryError);

      await Call.findByIdAndUpdate(callId, {
        $set: { 'aiSummary.status': 'FAILED', aiStatus: 'failed' },
      });

      await updateJob({
        status: 'FAILED',
        progress: 70,
        'stageStatus.summary': 'FAILED',
        error: summaryError instanceof Error ? summaryError.message : 'AI summary failed',
      });
    }
  } catch (fatalError) {
    console.error('[CallProcessing] Fatal pipeline error:', fatalError instanceof Error ? fatalError.message : fatalError);

    await CallProcessingJob.findByIdAndUpdate(jobId, {
      $set: {
        status: 'FAILED',
        error: fatalError instanceof Error ? fatalError.message : 'Unknown pipeline error',
        completedAt: new Date(),
      },
    });
  }
}
