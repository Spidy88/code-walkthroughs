/**
 * Fixture path for the canvas demo. Approximates a checkout-flow walkthrough:
 * a router dispatches into a route handler that calls auth + validation
 * preludes, then talks to billing + persistence + responds.
 */

import type { CanvasEdgeType, CanvasNodeType } from '../components/blueprint/index.ts';

export const FIXTURE_NODES: ReadonlyArray<CanvasNodeType> = [
  {
    id: 'router',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'dispatcher',
      title: 'POST /checkout',
    },
  },
  {
    id: 'authMiddleware',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'preamble',
      title: 'authMiddleware',
      subtitle: 'app/middleware/auth.ts',
    },
  },
  {
    id: 'handlePurchase',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'code',
      focused: true,
      figureLabel: 'FIG. A',
      classification: 'route-handler',
      status: 'reviewed_stale',
      filePath: 'src/routes/purchase.ts',
      title: 'handlePurchase(req, res)',
      bodyPreview: [
        'const user = await authenticate(req)',
        'if (!user) return res.status(401).send()',
        'const { items } = req.body',
        'const validated = validateOrder(items)',
        'const charge = await billing.charge({…})',
        'await orders.create({ userId, charge })',
      ],
      callsTo: 'billing.charge()',
      chips: [
        { variant: 'modified', label: 'MODIFIED' },
        { variant: 'new', label: 'NEW CALLS' },
      ],
    },
  },
  {
    id: 'validateOrder',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'summary',
      classification: 'service',
      status: 'reviewed_current',
      title: 'validateOrder(items)',
      subtitle: 'src/services/order-validation.ts',
    },
  },
  {
    id: 'billingCharge',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'summary',
      classification: 'client',
      status: 'never_reviewed',
      title: 'billing.charge(payload)',
      subtitle: 'src/clients/billing.ts',
    },
  },
  {
    id: 'ordersCreate',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'summary',
      classification: 'repository',
      status: 'reviewed_current',
      title: 'orders.create(input)',
      subtitle: 'src/repositories/orders.ts',
    },
  },
  {
    id: 'unresolvedTax',
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'summary',
      classification: 'unclassified',
      status: 'info_requested',
      title: 'taxStrategy.compute()',
      subtitle: 'dynamic dispatch — pick implementation',
    },
  },
];

export const FIXTURE_EDGES: ReadonlyArray<CanvasEdgeType> = [
  {
    id: 'router→handler',
    type: 'canvas-edge',
    source: 'router',
    target: 'handlePurchase',
    data: { variant: 'handler-attached' },
  },
  {
    id: 'auth→handler',
    type: 'canvas-edge',
    source: 'authMiddleware',
    target: 'handlePurchase',
    data: { variant: 'resolved' },
  },
  {
    id: 'handler→validate',
    type: 'canvas-edge',
    source: 'handlePurchase',
    target: 'validateOrder',
    data: { variant: 'resolved', callSiteLine: 147 },
  },
  {
    id: 'handler→billing',
    type: 'canvas-edge',
    source: 'handlePurchase',
    target: 'billingCharge',
    data: { variant: 'dig-into-active', callSiteLine: 149 },
  },
  {
    id: 'handler→orders',
    type: 'canvas-edge',
    source: 'handlePurchase',
    target: 'ordersCreate',
    data: { variant: 'resolved', callSiteLine: 155 },
  },
  {
    id: 'billing→tax',
    type: 'canvas-edge',
    source: 'billingCharge',
    target: 'unresolvedTax',
    data: { variant: 'unresolved' },
  },
];

/**
 * A second snapshot of the same path for the paired-canvas demo (comparison
 * mode). Removes one node and adds another to demonstrate restructured
 * differences.
 */
export const FIXTURE_BASE_NODES: ReadonlyArray<CanvasNodeType> = FIXTURE_NODES.filter(
  (node) => node.id !== 'unresolvedTax',
).map((node) =>
  node.id === 'handlePurchase'
    ? {
        ...node,
        data: {
          ...node.data,
          chips: [],
          status: 'reviewed_current' as const,
        },
      }
    : node,
);

export const FIXTURE_BASE_EDGES: ReadonlyArray<CanvasEdgeType> = FIXTURE_EDGES.filter(
  (edge) => edge.target !== 'unresolvedTax' && edge.id !== 'handler→billing',
).concat({
  id: 'handler→billing-base',
  type: 'canvas-edge',
  source: 'handlePurchase',
  target: 'billingCharge',
  data: { variant: 'resolved', callSiteLine: 149 },
});
