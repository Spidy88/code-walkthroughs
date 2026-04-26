import { describe, expect, test } from 'vitest';
import {
  type CanvasEdgeType,
  type CanvasNodeType,
  layoutCanvas,
} from '../src/components/blueprint/index.ts';

const fixtureNode = (id: string, variant: CanvasNodeType['data']['variant']): CanvasNodeType => ({
  id,
  type: 'canvas-node',
  position: { x: 0, y: 0 },
  data: {
    variant,
    title: id,
  },
});

const fixtureEdge = (source: string, target: string): CanvasEdgeType => ({
  id: `${source}→${target}`,
  type: 'canvas-edge',
  source,
  target,
  data: { variant: 'resolved' },
});

describe('layoutCanvas', () => {
  test('produces deterministic positions for the same input', () => {
    // Arrange
    const nodes = [
      fixtureNode('a', 'dispatcher'),
      fixtureNode('b', 'code'),
      fixtureNode('c', 'summary'),
    ];
    const edges = [fixtureEdge('a', 'b'), fixtureEdge('b', 'c')];

    // Act
    const first = layoutCanvas(nodes, edges);
    const second = layoutCanvas(nodes, edges);

    // Assert
    expect(first.nodes.map((n) => n.position)).toEqual(second.nodes.map((n) => n.position));
  });

  test('lays out a horizontal tree (LR) — children appear to the right of parents', () => {
    const nodes = [fixtureNode('parent', 'code'), fixtureNode('child', 'summary')];
    const edges = [fixtureEdge('parent', 'child')];

    const result = layoutCanvas(nodes, edges);
    const [parent, child] = result.nodes;
    if (!parent || !child) throw new Error('expected both nodes');

    expect(child.position.x).toBeGreaterThan(parent.position.x);
  });

  test('preserves all input nodes and edges', () => {
    const nodes = [
      fixtureNode('a', 'dispatcher'),
      fixtureNode('b', 'preamble'),
      fixtureNode('c', 'code'),
      fixtureNode('d', 'summary'),
    ];
    const edges = [fixtureEdge('a', 'c'), fixtureEdge('b', 'c'), fixtureEdge('c', 'd')];

    const result = layoutCanvas(nodes, edges);

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
    expect(new Set(result.nodes.map((n) => n.id))).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  test('attaches width/height to each node from variant dimensions', () => {
    const nodes = [fixtureNode('code', 'code'), fixtureNode('disp', 'dispatcher')];
    const result = layoutCanvas(nodes, []);
    const code = result.nodes.find((n) => n.id === 'code');
    const disp = result.nodes.find((n) => n.id === 'disp');
    expect(code?.width).toBe(320);
    expect(disp?.width).toBe(180);
  });
});
