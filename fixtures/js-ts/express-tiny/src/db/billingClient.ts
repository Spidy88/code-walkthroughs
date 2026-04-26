/**
 * Stand-in for an external billing client. Real implementation would call
 * Stripe / Adyen / similar; for the fixture this just returns a fake
 * charge so the call graph terminates at an external boundary.
 */
export async function chargeViaStripe(orderId: number): Promise<{
  chargeId: string;
  orderId: number;
  status: 'succeeded' | 'failed';
}> {
  return {
    chargeId: `ch_${Math.random().toString(36).slice(2)}`,
    orderId,
    status: 'succeeded',
  };
}
