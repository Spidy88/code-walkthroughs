import type { Express } from 'express';
import { createSession } from '../services/sessionService.ts';

export function registerSessionRoutes(app: Express): void {
  app.post('/sessions', async function login(req, res) {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }
    const session = await createSession(email, password);
    if (!session) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.status(201).json(session);
  });
}
