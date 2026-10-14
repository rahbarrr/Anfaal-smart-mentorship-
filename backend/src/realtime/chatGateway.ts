import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { isSupabaseAuthEnabled } from '../config/supabase.js';
import { AuthenticatedUser } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { getSupabaseUserContext } from '../services/supabaseAuthService.js';
import { setChatIo } from './chatRuntime.js';

type ChatSocket = Socket & { data: { user?: AuthenticatedUser } };
const collection = (name: string) => mongoose.connection.collection(name);

function validConversationId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

async function authenticate(token: unknown): Promise<AuthenticatedUser | null> {
  if (typeof token !== 'string' || !token) return null;

  if (isSupabaseAuthEnabled()) {
    const context = await getSupabaseUserContext(token);
    if (!context || context.status !== 'active' || !['ADMIN', 'MENTOR', 'MENTEE'].includes(context.role)) return null;
    return { id: context.id, email: context.email, role: context.role, menteeId: context.menteeId };
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as { id?: string; role?: AuthenticatedUser['role'] };
    if (!payload.id || !payload.role || !['ADMIN', 'MENTOR', 'MENTEE'].includes(payload.role)) return null;
    const user = await User.findById(payload.id).select('email role status menteeId').lean();
    if (!user || user.status !== 'active' || user.role !== payload.role) return null;
    return { id: String(user._id), email: user.email, role: user.role, menteeId: user.menteeId };
  } catch {
    return null;
  }
}

async function conversationForUser(userId: string, conversationId: string) {
  if (!validConversationId(conversationId)) return null;
  return collection('conversations').findOne({
    _id: new mongoose.Types.ObjectId(conversationId),
    participantIds: userId,
    deletedAt: null,
  });
}

export function configureChatGateway(io: Server) {
  setChatIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      const user = await authenticate(token);
      if (!user) return next(new Error('Unauthorized'));
      (socket as ChatSocket).data.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as ChatSocket;
    const user = socket.data.user!;

    socket.on('chat:join', async (payload: { conversationId?: string }, acknowledge?: (result: { ok: boolean; message?: string }) => void) => {
      const conversationId = payload?.conversationId ?? '';
      if (!(await conversationForUser(user.id, conversationId))) {
        acknowledge?.({ ok: false, message: 'Conversation not found.' });
        return;
      }
      await socket.join(`conversation:${conversationId}`);
      acknowledge?.({ ok: true });
    });

    socket.on('chat:send', async (payload: { conversationId?: string; text?: string }, acknowledge?: (result: { ok: boolean; message?: string; data?: unknown }) => void) => {
      try {
        const conversationId = payload?.conversationId ?? '';
        const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
        if (!(await conversationForUser(user.id, conversationId))) {
          acknowledge?.({ ok: false, message: 'Conversation not found.' });
          return;
        }
        if (!text || text.length > 4000) {
          acknowledge?.({ ok: false, message: 'Message must be between 1 and 4000 characters.' });
          return;
        }

        const createdAt = new Date();
        const doc = { conversationId, senderId: user.id, text, createdAt };
        const result = await collection('messages').insertOne(doc);
        await collection('conversations').updateOne(
          { _id: new mongoose.Types.ObjectId(conversationId), deletedAt: null },
          { $set: { updatedAt: createdAt, lastMessage: text } },
        );
        const message = { ...doc, id: String(result.insertedId) };
        io.to(`conversation:${conversationId}`).emit('chat:message', message);
        acknowledge?.({ ok: true, data: message });
      } catch {
        acknowledge?.({ ok: false, message: 'Unable to send message right now.' });
      }
    });

    socket.on('chat:typing', async (payload: { conversationId?: string; isTyping?: boolean }) => {
      const conversationId = payload?.conversationId ?? '';
      if (!(await conversationForUser(user.id, conversationId))) return;
      socket.to(`conversation:${conversationId}`).emit('chat:typing', { userId: user.id, isTyping: Boolean(payload?.isTyping) });
    });
  });
}
