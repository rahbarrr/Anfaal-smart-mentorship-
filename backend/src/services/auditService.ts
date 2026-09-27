import { AuditLog, AuditLogDocument } from '../models/AuditLog.js';

export interface CreateAuditLogParams {
  userId: string;
  userName?: string;
  userRole: 'ADMIN' | 'MENTOR' | 'MENTEE';
  action: AuditLogDocument['action'];
  targetType: AuditLogDocument['targetType'];
  targetId: string;
  menteeName?: string;
  mentorName?: string;
  details: string;
  ipAddress?: string;
}

export async function logAuditEvent(params: CreateAuditLogParams): Promise<void> {
  try {
    await AuditLog.create({
      ...params,
      userName: params.userName || 'Unknown User',
    });
  } catch (err) {
    // Non-blocking error logging
    console.error('[AuditService] Failed to record audit log:', err);
  }
}
