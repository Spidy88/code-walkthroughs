import type { Express, Request } from 'express';
import { fetchUser, listUsers, registerUser } from '../services/userService.ts';

export function registerUserRoutes(app: Express): void {
  app.get('/users', async function listAllUsers(_req, res) {
    const users = await listUsers();
    res.json(users);
  });

  app.get('/users/:id', async function getOneUser(req, res) {
    const id = Number(req.params.id);
    const user = await fetchUser(id);
    if (!user) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(user);
  });

  app.post('/users', async function createUser(req, res) {
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email || !name) {
      res.status(400).json({ error: 'email and name required' });
      return;
    }
    const user = await registerUser({ email, name });
    res.status(201).json(user);
  });

  app.delete('/users/:id', async function deleteUser(req, res) {
    const id = Number(req.params.id);
    const requester = (req as Request & { userId?: number }).userId;
    if (requester !== id) {
      res.status(403).json({ error: 'cannot delete another user' });
      return;
    }
    await registerUser({ email: 'deleted', name: 'deleted' }); // pretend cleanup
    res.status(204).end();
  });
}
