import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyUserCredentials } from '@/lib/auth/serverAuth';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Allow either 'identifier' or legacy 'email'
    const identifier = body.identifier || body.email;
    const parsed = loginSchema.safeParse({ identifier, password: body.password });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Valid email, phone, or MAKID and password are required.' },
        { status: 400 },
      );
    }

    const { customToken, user } = await verifyUserCredentials(
      parsed.data.identifier,
      parsed.data.password,
    );

    return NextResponse.json({
      customToken,
      user,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unable to sign in';
    return NextResponse.json({ message }, { status: 401 });
  }
}
