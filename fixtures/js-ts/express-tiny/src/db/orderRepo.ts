type Order = {
  id: number;
  userId: number;
  total: number;
  items: Array<{ sku: string; qty: number }>;
};
const orders: Order[] = [];

export async function selectOrdersByUser(userId: number): Promise<ReadonlyArray<Order>> {
  return orders.filter((o) => o.userId === userId);
}

export async function insertOrder(input: {
  userId: number;
  total: number;
  items: Array<{ sku: string; qty: number }>;
}): Promise<Order> {
  const id = orders.length + 1;
  const order = { id, ...input };
  orders.push(order);
  return order;
}
