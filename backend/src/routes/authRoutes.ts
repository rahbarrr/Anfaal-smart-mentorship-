import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { loginUser } from '../services/authService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Valid email and password are required.' });
    }

    const result = await loginUser(parsed.data);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in';
    return res.status(401).json({ message });
  }
});

export default router;
