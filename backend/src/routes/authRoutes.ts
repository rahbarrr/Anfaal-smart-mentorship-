import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { loginUser, getUserSession } from '../services/authService.js';
import { isSupabaseAuthEnabled } from '../config/supabase.js';
import { signInWithSupabase } from '../services/supabaseAuthService.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

const loginSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Valid email and password are required.' });
    }

    const result = isSupabaseAuthEnabled()
      ? await signInWithSupabase(parsed.data.email, parsed.data.password).then((session) => ({
          token: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
          user: session.user,
        }))
      : await loginUser(parsed.data);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in';
    return res.status(401).json({ message });
  }
});

router.get(['/me', '/session'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (isSupabaseAuthEnabled()) {
      return res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
          menteeId: req.user.menteeId,
          mentorApprovalStatus: req.user.mentorApprovalStatus,
        },
      });
    }

    const session = await getUserSession(req.user.id);
    if (!session) {
      return res.status(401).json({ message: 'Your session is no longer active. Please sign in again.' });
    }

    return res.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify session.';
    return res.status(500).json({ message });
  }
});

router.post('/refresh', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (isSupabaseAuthEnabled()) {
      return res.json({
        user: req.user,
      });
    }

    const session = await getUserSession(req.user.id);
    if (!session) {
      return res.status(401).json({ message: 'Your session is no longer active. Please sign in again.' });
    }

    return res.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh session.';
    return res.status(500).json({ message });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  return res.json({ message: 'Signed out successfully.' });
});

export default router;
