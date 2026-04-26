import type { ProjectMeta } from '@cw/shared';
import { describe, expect, test } from 'vitest';
import type { ClassifierSignal, SignalInput } from '../src/adapter.ts';
import { jsTsClassifierSignals } from '../src/js-ts/classifier-signals.ts';
import { parseJsTs } from '../src/js-ts/parse.ts';

const project: ProjectMeta = {
  id: 'proj',
  codebaseId: 'cb' as ProjectMeta['codebaseId'],
  name: 'sample',
  rootPath: '/tmp/sample',
  language: 'typescript',
  frameworks: [],
  walkable: true,
};

function classify(
  filePath: string,
  content = 'export function noop() {}',
): {
  matched: ReadonlyArray<{ name: string; classification: string }>;
} {
  const parsed = parseJsTs({
    projectId: project.id,
    filePath,
    content,
  });
  const input: SignalInput = {
    project,
    parsed,
    relativePath: filePath,
  };
  const matched = jsTsClassifierSignals
    .map((sig) => {
      const r = sig.match(input);
      return r ? { name: sig.name, classification: r.classification } : null;
    })
    .filter((row): row is { name: string; classification: string } => row !== null);
  return { matched };
}

function bySignalName(signals: ReadonlyArray<ClassifierSignal>, name: string): ClassifierSignal {
  const sig = signals.find((s) => s.name === name);
  if (!sig) throw new Error(`signal ${name} not found`);
  return sig;
}

describe('jsTsClassifierSignals — repository detection', () => {
  // Regression — bug discovered against the express-tiny fixture: a file at
  // src/db/orderRepo.ts classified as 'unclassified' because the existing
  // signals only matched on imports (Prisma / Drizzle / TypeORM). The
  // path-based pattern was missing.
  test.each([
    ['src/db/userRepo.ts'],
    ['src/db/order-repo.ts'],
    ['src/repositories/users.ts'],
    ['src/repos/users.ts'],
    ['src/dao/UserDao.ts'],
    ['src/dal/userDal.ts'],
    ['app/db/order.ts'],
  ])('classifies %s as repository', (path) => {
    const { matched } = classify(path);
    const repo = matched.find((m) => m.classification === 'repository');
    expect(repo, `expected repository match for ${path}`).toBeDefined();
  });

  test.each([['src/users/UserRepo.ts'], ['src/orders/OrderRepository.ts']])(
    'classifies %s as repository via filename suffix',
    (path) => {
      const { matched } = classify(path);
      const repo = matched.find((m) => m.classification === 'repository');
      expect(repo, `expected repository match for ${path}`).toBeDefined();
    },
  );

  test('does not over-match plain service files as repository', () => {
    const { matched } = classify('src/services/orderService.ts');
    expect(matched.find((m) => m.classification === 'repository')).toBeUndefined();
  });
});

describe('jsTsClassifierSignals — coverage of common conventions', () => {
  test('routes/ matches route_handler', () => {
    expect(classify('src/routes/users.ts').matched).toContainEqual({
      name: 'path:routes',
      classification: 'route_handler',
    });
  });

  test('services/ matches service', () => {
    expect(classify('src/services/users.ts').matched).toContainEqual({
      name: 'path:services',
      classification: 'service',
    });
  });

  test('middleware/ matches middleware', () => {
    expect(classify('src/middleware/auth.ts').matched).toContainEqual({
      name: 'path:middleware',
      classification: 'middleware',
    });
  });

  test('hooks/ matches hook', () => {
    expect(classify('src/hooks/useUser.ts').matched).toContainEqual({
      name: 'path:hooks',
      classification: 'hook',
    });
  });

  test('repository signal name is exposed', () => {
    expect(() => bySignalName(jsTsClassifierSignals, 'path:repositories')).not.toThrow();
  });
});
