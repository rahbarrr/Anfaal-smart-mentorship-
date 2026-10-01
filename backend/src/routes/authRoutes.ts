import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { loginUser } from '../services/authService.js';
import { isSupabaseAuthEnabled } from '../config/supabase.js';
import { signInWithSupabase } from '../services/supabaseAuthService.js';

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

export default router;
