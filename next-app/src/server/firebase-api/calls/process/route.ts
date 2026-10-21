import { NextResponse } from 'next/server';
import { verifyAuthUser } from '@/lib/auth/serverAuth';
import { processCallPipeline } from '@/lib/services/callProcessingService';

export async function POST(req: Request) {
  const authUser = await verifyAuthUser(req);
  if (!authUser || (authUser.role !== 'ADMIN' && authUser.role !== 'MENTOR')) {
    return NextResponse.json({ error: 'Unauthorized. Mentor or Admin role required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { callId, mentorNotes, skipTranscription } = body;

    if (!callId) {
      return NextResponse.json({ error: 'Missing callId.' }, { status: 400 });
    }

    // Run processing pipeline
    const result = await processCallPipeline({
      callId,
      mentorNotes,
      skipTranscription,
    });

    return NextResponse.json({
      success: true,
      callId: result.callId,
      message: 'Call processing completed successfully.',
    });
  } catch (error) {
    console.error('[CallProcessAPI] Error processing call:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Call processing failed.' },
      { status: 500 },
    );
  }
}
