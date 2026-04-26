import { findUserByEmail } from '../db/userRepo.ts';

const sessions = new Map<string, { userId: number; createdAt: number }>();

export function getSessionByToken(token: string) {
  return sessions.get(token) ?? null;
}

export async function createSession(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  // (real impl would verify password against hash; skipped for fixture)
  if (password.length < 4) return null;
  const token = `tok-${Math.random().toString(36).slice(2)}`;
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  return { token, userId: user.id };
}
