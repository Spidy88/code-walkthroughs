import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CW_SERVER_PORT: z.coerce.number().int().positive().default(4000),
  CW_WEB_PORT: z.coerce.number().int().positive().default(5173),
  CW_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CW_DATA_DIR: z.string().optional(),
  CW_ALLOW_REAL_LLM: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== '' && !(key in process.env)) out[key] = value;
  }
  return out;
}

export function loadEnv(cwd: string = process.cwd()): Env {
  const fromFile = parseEnvFile(resolve(cwd, '.env'));
  const merged = { ...fromFile, ...process.env };
  return envSchema.parse(merged);
}
