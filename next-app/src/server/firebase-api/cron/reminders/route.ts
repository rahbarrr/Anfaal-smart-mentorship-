import { NextResponse } from 'next/server';
import { evaluateDailyProgressReminders } from '@/lib/services/reminderSchedulerService';
import { verifyAuthUser } from '@/lib/auth/serverAuth';

export async function POST(req: Request) {
  // Allow execution via CRON_SECRET header (for Cloud Scheduler / Vercel Cron)
  // or via Admin user authentication
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');

  const isSecretValid = cronSecret && (cronHeader === cronSecret || authHeader === `Bearer ${cronSecret}`);

  if (!isSecretValid) {
    const authUser = await verifyAuthUser(req);
    if (!authUser || authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  try {
    const result = await evaluateDailyProgressReminders();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('[CronRemindersAPI] Error evaluating reminders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to evaluate reminders.' },
      { status: 500 },
    );
  }
}

// Support GET for simple webhook pinging if authorized
export async function GET(req: Request) {
  return POST(req);
}
