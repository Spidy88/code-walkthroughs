import { useQuery } from '@tanstack/react-query';
import { trpcClient } from './trpc.ts';

export function App() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: () => trpcClient.codebase.listRecent.query(),
  });

  if (status.isLoading) return <main>Loading…</main>;
  if (status.error) return <main>Failed to reach server: {String(status.error)}</main>;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Code Walkthrough</h1>
      <section>
        <h2>Status</h2>
        <dl>
          <dt>LLM enabled</dt>
          <dd>{status.data?.llmEnabled ? 'yes' : 'no'}</dd>
          <dt>Active codebase</dt>
          <dd>{status.data?.active?.absolutePath ?? 'none'}</dd>
        </dl>
      </section>
      <section>
        <h2>Recent codebases</h2>
        <ul>
          {(recent.data ?? []).map((row) => (
            <li key={row.hash}>
              {row.label ?? row.absolutePath}
              <small style={{ marginLeft: 8, color: '#666' }}>{row.hash}</small>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
