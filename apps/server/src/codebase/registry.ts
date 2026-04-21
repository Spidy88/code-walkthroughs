import { ulid } from '@cw/shared';
import { desc, eq } from 'drizzle-orm';
import { recentCodebases } from '../db/schema/user/index.ts';
import type { RecentCodebaseRow } from '../db/schema/user/recent-codebases.ts';
import type { UserDb } from '../db/user.ts';

export type CodebaseRegistry = {
  list(): Promise<readonly RecentCodebaseRow[]>;
  findByHash(hash: string): Promise<RecentCodebaseRow | null>;
  touch(input: { hash: string; absolutePath: string; now: Date }): Promise<RecentCodebaseRow>;
  setLabel(hash: string, label: string | null): Promise<void>;
  remove(hash: string): Promise<void>;
};

export function createCodebaseRegistry(db: UserDb): CodebaseRegistry {
  return {
    async list() {
      return db.select().from(recentCodebases).orderBy(desc(recentCodebases.lastOpenedAt));
    },
    async findByHash(hash) {
      const rows = await db.select().from(recentCodebases).where(eq(recentCodebases.hash, hash));
      return rows[0] ?? null;
    },
    async touch({ hash, absolutePath, now }) {
      const timestamp = now.toISOString();
      const existing = await db
        .select()
        .from(recentCodebases)
        .where(eq(recentCodebases.hash, hash));
      const row = existing[0];
      if (row) {
        await db
          .update(recentCodebases)
          .set({ lastOpenedAt: timestamp, absolutePath })
          .where(eq(recentCodebases.hash, hash));
        return { ...row, lastOpenedAt: timestamp, absolutePath };
      }
      const inserted = {
        id: ulid(),
        hash,
        absolutePath,
        label: null,
        lastOpenedAt: timestamp,
        createdAt: timestamp,
      };
      await db.insert(recentCodebases).values(inserted);
      return inserted;
    },
    async setLabel(hash, label) {
      await db.update(recentCodebases).set({ label }).where(eq(recentCodebases.hash, hash));
    },
    async remove(hash) {
      await db.delete(recentCodebases).where(eq(recentCodebases.hash, hash));
    },
  };
}
