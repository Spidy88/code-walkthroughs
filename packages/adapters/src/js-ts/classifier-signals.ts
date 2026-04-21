import type { ClassifierSignal } from '../adapter.ts';

export const jsTsClassifierSignals: readonly ClassifierSignal[] = [
  {
    name: 'path:tests',
    kind: 'path-pattern',
    weight: 'high',
    match: ({ relativePath }) => {
      if (
        /(^|\/)__tests__(\/|$)/.test(relativePath) ||
        /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(relativePath)
      ) {
        return { classification: 'test' };
      }
      return null;
    },
  },
  {
    name: 'filename:type-only',
    kind: 'filename-pattern',
    weight: 'high',
    match: ({ relativePath }) => {
      if (relativePath.endsWith('.d.ts')) return { classification: 'type_only' };
      return null;
    },
  },
  {
    name: 'filename:config',
    kind: 'filename-pattern',
    weight: 'high',
    match: ({ relativePath }) => {
      const base = relativePath.split('/').at(-1) ?? '';
      if (
        /(^|\.)(next|vite|webpack|rollup|tsup|babel|jest|vitest|biome|eslint|prettier|tailwind|postcss)\.config\.(ts|js|mjs|cjs)$/.test(
          base,
        )
      ) {
        return { classification: 'config' };
      }
      if (base === 'tsconfig.json' || base.startsWith('tsconfig.')) {
        return { classification: 'config' };
      }
      return null;
    },
  },
  {
    name: 'path:routes',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)(routes|controllers|handlers)(\/|$)/.test(relativePath)) {
        return { classification: 'route_handler' };
      }
      return null;
    },
  },
  {
    name: 'path:services',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)services(\/|$)/.test(relativePath)) {
        return { classification: 'service' };
      }
      return null;
    },
  },
  {
    name: 'path:middleware',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)middleware(\/|$)/.test(relativePath)) {
        return { classification: 'middleware' };
      }
      return null;
    },
  },
  {
    name: 'path:hooks',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      const base = relativePath.split('/').at(-1) ?? '';
      if (/(^|\/)hooks(\/|$)/.test(relativePath) || /^use[A-Z].*\.(ts|tsx)$/.test(base)) {
        return { classification: 'hook' };
      }
      return null;
    },
  },
  {
    name: 'path:components',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)components(\/|$)/.test(relativePath) && /\.(tsx|jsx)$/.test(relativePath)) {
        return { classification: 'component' };
      }
      return null;
    },
  },
  {
    name: 'path:pages',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)(pages|app)(\/|$)/.test(relativePath) && /\.(tsx|jsx)$/.test(relativePath)) {
        return { classification: 'page' };
      }
      return null;
    },
  },
  {
    name: 'path:scripts',
    kind: 'path-pattern',
    weight: 'medium',
    match: ({ relativePath }) => {
      if (/(^|\/)(scripts|bin)(\/|$)/.test(relativePath)) {
        return { classification: 'script' };
      }
      return null;
    },
  },
  {
    name: 'path:seeds',
    kind: 'path-pattern',
    weight: 'high',
    match: ({ relativePath }) => {
      if (/(^|\/)seeds?(\/|$)/.test(relativePath) || /\.seed\.(ts|js|mjs)$/.test(relativePath)) {
        return { classification: 'seed' };
      }
      return null;
    },
  },
  {
    name: 'path:fixtures',
    kind: 'path-pattern',
    weight: 'high',
    match: ({ relativePath }) => {
      if (/(^|\/)fixtures?(\/|$)/.test(relativePath)) {
        return { classification: 'fixture' };
      }
      return null;
    },
  },
  {
    name: 'import:db-client',
    kind: 'import-based',
    weight: 'medium',
    match: ({ parsed }) => {
      const dbSpecifiers = ['@prisma/client', 'drizzle-orm', 'typeorm', 'mongoose', 'kysely'];
      const hit = parsed.imports.some((i) =>
        dbSpecifiers.some((s) => i.from === s || i.from.startsWith(`${s}/`)),
      );
      if (hit) return { classification: 'repository' };
      return null;
    },
  },
  {
    name: 'import:external-client',
    kind: 'import-based',
    weight: 'low',
    match: ({ parsed }) => {
      const clientSpecifiers = ['stripe', '@aws-sdk', 'openai', '@anthropic-ai/sdk', 'nodemailer'];
      const hit = parsed.imports.some((i) =>
        clientSpecifiers.some((s) => i.from === s || i.from.startsWith(`${s}/`)),
      );
      if (hit) return { classification: 'client' };
      return null;
    },
  },
];
