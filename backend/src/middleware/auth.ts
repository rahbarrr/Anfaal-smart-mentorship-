import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MENTOR';
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
    const secret = process.env.JWT_SECRET ?? 'development-secret';
    const payload = jwt.verify(token, secret) as AuthenticatedUser & { iat?: number; exp?: number };

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(role: 'ADMIN' | 'MENTOR') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }

    return next();
  };
}
