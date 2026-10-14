import crypto from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Router, Response } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { Mentee } from '../models/Mentee.js';
import { Call } from '../models/Call.js';
import { maskDeletedCallParts } from '../services/callVisibility.js';

const router = Router();
const collection = () => mongoose.connection.collection('aiMentorMessages');
const aiMentorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_MENTOR_RATE_LIMIT_PER_MINUTE || 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.id || req.ip || 'unknown',
  message: { message: 'AI Mentor is temporarily rate-limited. Please try again shortly.' },
});

async function contextForMentee(menteeId: string) {
  const [mentee, progress, calls] = await Promise.all([
    Mentee.findById(menteeId).select('name standard makid goals routine').lean(),
    DailyPerformance.find({ menteeId }).sort({ date: -1 }).limit(14).lean(),
    Call.find({ menteeId }).sort({ date: -1 }).limit(5).select('date summary summaryDeletedAt intelligenceDeletedAt aiSummary.shortSummary actionItems').lean(),
  ]);
  return { mentee, progress, calls: calls.map((call) => maskDeletedCallParts(call)) };
}

router.post('/chat', requireAuth, requireRole('MENTEE'), aiMentorLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 2000) return res.status(400).json({ message: 'Message must be between 1 and 2000 characters.' });
    const menteeId = req.user!.menteeId;
    if (!menteeId) return res.status(403).json({ message: 'Mentee profile is not configured.' });
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: 'AI Mentor is not configured on this environment.' });

    const requestedSessionId = typeof req.body.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const sessionId = requestedSessionId && requestedSessionId.length <= 100 ? requestedSessionId : crypto.randomUUID();
    const context = await contextForMentee(menteeId);
    if (!context.mentee) return res.status(404).json({ message: 'Mentee profile not found.' });
    const previous = await collection().find({ userId: req.user!.id, sessionId }).sort({ createdAt: -1 }).limit(12).toArray();
    const history = previous.reverse().map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content) }));
    const system = [
      'You are Anfaal AI Mentor, a supportive educational planning assistant for a student.',
      'Give practical, age-appropriate study guidance based on the supplied context. Do not claim to be a human mentor.',
      'Do not provide medical, legal, financial, or religious rulings. For serious wellbeing concerns, encourage contacting a trusted adult or assigned human mentor.',
      `Student context: ${JSON.stringify(context)}`,
    ].join('\n');
    const response = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', temperature: 0.4, max_tokens: 700, messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: message }] }),
      signal: AbortSignal.timeout(Number(process.env.AI_MENTOR_TIMEOUT_MS || 30000)),
    });
    if (!response.ok) return res.status(502).json({ message: 'AI Mentor is temporarily unavailable.' });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const reply = payload.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ message: 'AI Mentor returned an empty response.' });
    const createdAt = new Date();
    await collection().insertMany([
      { userId: req.user!.id, menteeId, sessionId, role: 'user', content: message, createdAt },
      { userId: req.user!.id, menteeId, sessionId, role: 'assistant', content: reply, createdAt: new Date() },
    ]);
    return res.json({ sessionId, message: { role: 'assistant', content: reply, createdAt: new Date() } });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unable to contact AI Mentor.' });
  }
});

router.get('/sessions/:sessionId', requireAuth, requireRole('MENTEE'), async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.params.sessionId);
  if (sessionId.length > 100) return res.status(400).json({ message: 'Invalid AI Mentor session.' });
  const messages = await collection().find({ userId: req.user!.id, sessionId }).sort({ createdAt: 1 }).limit(100).toArray();
  return res.json({ messages: messages.map((item) => ({ role: item.role, content: item.content, createdAt: item.createdAt })) });
});

export default router;
