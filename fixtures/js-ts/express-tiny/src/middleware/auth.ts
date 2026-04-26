import type { NextFunction, Request, Response } from 'express';
import { getSessionByToken } from '../services/sessionService.ts';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'missing token' });
    return;
  }
  const session = getSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: 'invalid token' });
    return;
  }
  (req as Request & { userId?: number }).userId = session.userId;
  next();
}
