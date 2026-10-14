import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { Call } from '../models/Call.js';
import { Mentee } from '../models/Mentee.js';
import { Mentor } from '../models/Mentor.js';
import { Mentorship } from '../models/Mentorship.js';
import { User } from '../models/User.js';
import { emitChatMessage } from '../realtime/chatRuntime.js';
import { maskDeletedCallParts } from '../services/callVisibility.js';

const router = Router();
const collection = (name: string) => mongoose.connection.collection(name);
type FeatureDocument = Record<string, unknown> & { _id?: mongoose.Types.ObjectId };

function serialize<T extends FeatureDocument>(document: T | null) {
  if (!document) return null;
  const { _id, ...rest } = document;
  return { ...rest, id: String(_id ?? document.id ?? '') };
}
function serializeMany<T extends FeatureDocument>(documents: T[]) {
  return documents.flatMap((document) => {
    const item = serialize(document);
    return item ? [item] : [];
  });
}
function validObjectId(value: unknown): value is string { return typeof value === 'string' && mongoose.isValidObjectId(value); }
function dateOnly(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

async function assignedMenteeIds(user: AuthRequest['user']): Promise<string[]> {
  if (!user) return [];
  if (user.role === 'ADMIN') return (await Mentee.find({}, { _id: 1 }).lean()).map((mentee) => String(mentee._id));
  if (user.role === 'MENTEE') return user.menteeId ? [String(user.menteeId)] : [];
  const mentor = await Mentor.findOne({ userId: user.id }, { _id: 1 }).lean();
  if (!mentor) return [];
  const assignments = await Mentorship.find({ mentorId: String(mentor._id), status: 'active' }, { menteeId: 1 }).lean();
  return assignments.map((assignment) => String(assignment.menteeId));
}
async function canAccessMentee(user: AuthRequest['user'], menteeId: string) { return Boolean(user && (user.role === 'ADMIN' || (await assignedMenteeIds(user)).includes(String(menteeId)))); }
async function mentorStorageId(user: AuthRequest['user']) {
  if (!user || user.role !== 'MENTOR') return user?.id ?? '';
  const mentor = await Mentor.findOne({ userId: user.id }, { _id: 1 }).lean();
  return mentor ? String(mentor._id) : user.id;
}

router.get('/attendance', requireAuth, async (req: AuthRequest, res: Response) => {
  const query: Record<string, unknown> = { month: String(req.query.month || new Date().toISOString().slice(0, 7)) };
  if (req.user?.role !== 'ADMIN') query.menteeId = { $in: await assignedMenteeIds(req.user) };
  const records = await collection('attendance').find({ ...query, deletedAt: null }).sort({ date: -1 }).toArray();
  return res.json({ records: serializeMany(records) });
});

router.post('/attendance', requireAuth, async (req: AuthRequest, res: Response) => {
  const menteeId = String(req.body.menteeId || '');
  const date = dateOnly(req.body.date);
  const status = req.body.status === 'PRESENT' || req.body.status === 'ABSENT' ? req.body.status : '';
  if (!validObjectId(menteeId) || !date || !status) return res.status(400).json({ message: 'Mentee, date, and status are required.' });
  if (!(await canAccessMentee(req.user, menteeId))) return res.status(403).json({ message: 'You do not have access to this mentee.' });
  const record = { menteeId, date, status, source: String(req.body.source || 'MANUAL'), notes: String(req.body.notes || ''), month: date.slice(0, 7), createdBy: req.user!.id, updatedAt: new Date() };
  const result = await collection('attendance').findOneAndUpdate({ menteeId, date }, { $set: record }, { upsert: true, returnDocument: 'after' });
  return res.json({ record: serialize(result as FeatureDocument) });
});

router.get('/announcements', requireAuth, async (req: AuthRequest, res: Response) => {
  const audience = req.user?.role === 'MENTOR' ? ['EVERYONE', 'MENTORS'] : req.user?.role === 'MENTEE' ? ['EVERYONE', 'MENTEES'] : ['EVERYONE', 'MENTORS', 'MENTEES'];
  const announcements = await collection('announcements').find({ audience: { $in: audience }, deletedAt: null }).sort({ pinned: -1, createdAt: -1 }).toArray();
  const reads = await collection('announcementReads').find({ announcementId: { $in: announcements.map((item) => String(item._id)) }, userId: req.user!.id }).toArray();
  const readIds = new Set(reads.map((read) => String(read.announcementId)));
  return res.json({ announcements: serializeMany(announcements).map((item) => ({ ...item, read: readIds.has(String(item.id)) })) });
});

router.post('/announcements', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  const audience = ['EVERYONE', 'MENTORS', 'MENTEES'].includes(req.body.audience) ? req.body.audience : 'EVERYONE';
  if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });
  const doc = { title, body, audience, priority: String(req.body.priority || 'NORMAL'), pinned: Boolean(req.body.pinned), createdBy: req.user!.id, createdAt: new Date() };
  const result = await collection('announcements').insertOne(doc);
  return res.status(201).json({ announcement: serialize({ ...doc, _id: result.insertedId }) });
});
router.post('/announcements/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid announcement.' });
  await collection('announcementReads').updateOne({ announcementId: req.params.id, userId: req.user!.id }, { $set: { readAt: new Date() } }, { upsert: true });
  return res.json({ success: true });
});

async function chatContacts(user: AuthRequest['user']) {
  if (!user) return [];
  if (user.role === 'ADMIN') return (await User.find({ status: 'active', role: { $in: ['MENTOR', 'MENTEE'] } }, { name: 1, email: 1, role: 1 }).lean()).map((item) => ({ id: String(item._id), name: item.name, email: item.email, role: item.role }));
  const menteeIds = await assignedMenteeIds(user);
  if (user.role === 'MENTOR') {
    const mentees = await Mentee.find({ _id: { $in: menteeIds } }, { userId: 1, name: 1 }).lean();
    return mentees.filter((item) => item.userId).map((item) => ({ id: String(item.userId), name: item.name, role: 'MENTEE' as const }));
  }
  const assignments = await Mentorship.find({ menteeId: { $in: menteeIds }, status: 'active' }, { mentorId: 1 }).lean();
  const mentors = await Mentor.find({ _id: { $in: assignments.map((item) => String(item.mentorId)) } }, { userId: 1 }).lean();
  const users = await User.find({ _id: { $in: mentors.map((item) => item.userId) }, status: 'active' }, { name: 1, email: 1, role: 1 }).lean();
  return users.map((item) => ({ id: String(item._id), name: item.name, email: item.email, role: item.role }));
}
router.get('/chat/contacts', requireAuth, async (req: AuthRequest, res: Response) => res.json({ contacts: await chatContacts(req.user) }));
async function conversationForUser(userId: string, conversationId: string) {
  if (!validObjectId(conversationId)) return null;
  return collection('conversations').findOne({ _id: new mongoose.Types.ObjectId(conversationId), participantIds: userId, deletedAt: null });
}
router.get('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const conversations = await collection('conversations').find({ participantIds: req.user!.id, deletedAt: null }).sort({ updatedAt: -1 }).toArray();
  return res.json({ conversations: serializeMany(conversations) });
});
router.post('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const requested = Array.isArray(req.body.participantIds) ? req.body.participantIds.map(String) : [];
  const participantIds = [...new Set([req.user!.id, ...requested])].filter(Boolean);
  if (participantIds.length !== 2) return res.status(400).json({ message: 'Choose exactly one contact.' });
  if (!(await chatContacts(req.user)).some((contact) => contact.id === participantIds[1])) return res.status(403).json({ message: 'You can only chat with an assigned contact.' });
  const existing = await collection('conversations').findOne({ participantIds: { $all: participantIds }, deletedAt: null, $expr: { $eq: [{ $size: '$participantIds' }, 2] } });
  if (existing) return res.json({ conversation: serialize(existing) });
  const doc = { participantIds, createdAt: new Date(), updatedAt: new Date() };
  const result = await collection('conversations').insertOne(doc);
  return res.status(201).json({ conversation: serialize({ ...doc, _id: result.insertedId }) });
});
router.get('/conversations/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  const conversationId = String(req.params.id);
  if (!(await conversationForUser(req.user!.id, conversationId))) return res.status(404).json({ message: 'Conversation not found.' });
  const messages = await collection('messages').find({ conversationId, deletedAt: null }).sort({ createdAt: 1 }).toArray();
  return res.json({ messages: serializeMany(messages) });
});
router.post('/conversations/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  const conversationId = String(req.params.id);
  const conversation = await conversationForUser(req.user!.id, conversationId);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  const text = String(req.body.text || '').trim();
  if (!text || text.length > 4000) return res.status(400).json({ message: 'Message must be between 1 and 4000 characters.' });
  const doc = { conversationId, senderId: req.user!.id, text, createdAt: new Date() };
  const result = await collection('messages').insertOne(doc);
  await collection('conversations').updateOne({ _id: conversation._id }, { $set: { updatedAt: doc.createdAt, lastMessage: doc.text } });
  const message = serialize({ ...doc, _id: result.insertedId });
  emitChatMessage(conversationId, message);
  return res.status(201).json({ message });
});

router.get('/admin/proxy-assignments', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const assignments = await collection('proxyAssignments').find({ deletedAt: null }).sort({ startDate: -1 }).toArray();
  return res.json({ assignments: serializeMany(assignments) });
});
router.post('/admin/proxy-assignments', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { menteeId, primaryMentorId, proxyMentorId, startDate, endDate } = req.body;
  if (![menteeId, primaryMentorId, proxyMentorId, startDate, endDate].every(Boolean)) return res.status(400).json({ message: 'Mentee, mentors, and dates are required.' });
  const start = new Date(String(startDate));
  const end = new Date(String(endDate));
  if (primaryMentorId === proxyMentorId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return res.status(400).json({ message: 'Proxy mentor and primary mentor must differ, and dates must be valid.' });
  const doc = { menteeId: String(menteeId), primaryMentorId: String(primaryMentorId), proxyMentorId: String(proxyMentorId), startDate: String(startDate), endDate: String(endDate), reason: String(req.body.reason || ''), createdBy: req.user!.id, createdAt: new Date() };
  const result = await collection('proxyAssignments').insertOne(doc);
  return res.status(201).json({ assignment: serialize({ ...doc, _id: result.insertedId }) });
});

router.get('/calls/summary-report', requireAuth, async (req: AuthRequest, res: Response) => {
  const days = req.query.period === 'month' ? 30 : 7;
  const filter: Record<string, unknown> = { date: { $gte: new Date(Date.now() - days * 86400000) } };
  if (req.user?.role === 'MENTOR') filter.mentorId = await mentorStorageId(req.user);
  if (req.user?.role === 'MENTEE') filter.menteeId = { $in: await assignedMenteeIds(req.user) };
  const calls = await Call.find(filter).sort({ date: -1 }).lean();
  const visibleCalls = calls.map((call) => maskDeletedCallParts(call));
  return res.json({ totalCalls: visibleCalls.length, completedSummaries: visibleCalls.filter((call) => call.aiSummary?.status === 'COMPLETED' || Boolean(call.summary)).length, calls: visibleCalls.map((call) => ({ id: String(call._id), date: call.date, summary: { overview: call.aiSummary?.shortSummary || call.summary || '' } })) });
});
router.post('/calls/manual-summary', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'MENTOR' && req.user!.role !== 'ADMIN') return res.status(403).json({ message: 'Only mentors can add call summaries.' });
  const menteeId = String(req.body.menteeId || '');
  const date = dateOnly(req.body.date) || new Date().toISOString().slice(0, 10);
  const summary = String(req.body.summary || '').trim();
  if (!validObjectId(menteeId) || summary.length < 10) return res.status(400).json({ message: 'Mentee and a meaningful summary are required.' });
  if (!(await canAccessMentee(req.user, menteeId))) return res.status(403).json({ message: 'You do not have access to this mentee.' });
  const call = await Call.create({ mentorId: await mentorStorageId(req.user), menteeId, date: new Date(`${date}T12:00:00.000Z`), duration: 0, recordingStatus: 'pending', processingStatus: 'completed', reviewStatus: 'Approved', aiStatus: 'completed', summary, mentorNotes: summary, aiSummary: { status: 'COMPLETED', shortSummary: summary, generatedAt: new Date() } });
  await collection('attendance').updateOne({ menteeId, date }, { $set: { menteeId, date, month: date.slice(0, 7), status: 'PRESENT', source: req.body.callType || 'WHATSAPP_CALL', createdBy: req.user!.id, updatedAt: new Date() } }, { upsert: true });
  return res.status(201).json({ call });
});

export default router;
