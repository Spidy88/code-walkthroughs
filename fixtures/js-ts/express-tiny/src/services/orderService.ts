import { chargeViaStripe } from '../db/billingClient.ts';
import { insertOrder, selectOrdersByUser } from '../db/orderRepo.ts';

export async function listOrders(userId: number) {
  return selectOrdersByUser(userId);
}

export async function createOrder(input: {
  userId: number;
  items: Array<{ sku: string; qty: number }>;
}) {
  const total = input.items.reduce((sum, item) => sum + item.qty * 100, 0);
  return insertOrder({ userId: input.userId, total, items: input.items });
}

export async function chargeOrder(orderId: number) {
  return chargeViaStripe(orderId);
}
