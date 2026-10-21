import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';

const EXPIRES_IN = 5 * 24 * 60 * 60 * 1000; // 5 days

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ message: 'Missing idToken' }, { status: 400 });
    }

    const { adminAuth } = getFirebaseAdmin();
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });

    const response = NextResponse.json({ status: 'success' });
    response.cookies.set('__session', sessionCookie, {
      maxAge: EXPIRES_IN / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to create session' }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: 'logged_out' });
  response.cookies.set('__session', '', {
    maxAge: 0,
    path: '/',
  });
  return response;
}
