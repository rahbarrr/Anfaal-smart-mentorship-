import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getSupabaseUserContext } from '../services/supabaseAuthService.js';
import { isSupabaseAuthEnabled } from '../config/supabase.js';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MENTOR' | 'MENTEE';
  menteeId?: string;
  mentorApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    if (isSupabaseAuthEnabled()) {
      void getSupabaseUserContext(token)
        .then((context) => {
          if (!context) return res.status(401).json({ message: 'Invalid or expired token.' });
          const role = context.role;
          if (!['ADMIN', 'MENTOR', 'MENTEE'].includes(role) || context.status !== 'active') {
            return res.status(403).json({ message: 'Account role is not configured.' });
          }
          req.user = { id: context.id, email: context.email, role, menteeId: context.menteeId };
          return next();
        })
        .catch(() => res.status(401).json({ message: 'Invalid or expired token.' }));
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Authentication configuration error.' });
    }
    const payload = jwt.verify(token, secret) as AuthenticatedUser & { iat?: number; exp?: number };

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      menteeId: payload.menteeId,
      mentorApprovalStatus: payload.mentorApprovalStatus,
    };

    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: ('ADMIN' | 'MENTOR' | 'MENTEE')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }

    if (req.user.role === 'MENTOR') {
      if (req.user.mentorApprovalStatus === 'PENDING') {
        return res.status(403).json({ message: 'Your mentor account is pending approval.' });
      }

      if (req.user.mentorApprovalStatus === 'REJECTED') {
        return res.status(403).json({ message: 'Your mentor application was rejected.' });
      }
    }

    return next();
  };
}
