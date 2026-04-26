import type { Express, Request } from 'express';
import { chargeOrder, createOrder, listOrders } from '../services/orderService.ts';

export function registerOrderRoutes(app: Express): void {
  app.get('/orders', async function listMyOrders(req, res) {
    const userId = (req as Request & { userId?: number }).userId;
    if (!userId) {
      res.status(401).end();
      return;
    }
    const orders = await listOrders(userId);
    res.json(orders);
  });

  app.post('/orders', async function placeOrder(req, res) {
    const userId = (req as Request & { userId?: number }).userId;
    if (!userId) {
      res.status(401).end();
      return;
    }
    const { items } = req.body as { items?: Array<{ sku: string; qty: number }> };
    if (!items || items.length === 0) {
      res.status(400).json({ error: 'items required' });
      return;
    }
    const order = await createOrder({ userId, items });
    const charge = await chargeOrder(order.id);
    res.status(201).json({ order, charge });
  });
}
