import type { Options } from 'postgres'

/**
 * Options for the postgres.js client, kept apart from the client itself so a
 * test can pin them. See lib/db/index.ts for why the pooler, `max` and
 * `prepare` are what they are.
 *
 * `max_pipeline: 0` is the one that matters, and it cost a production outage
 * (2026-09-24, every /manage page timing out at 30 s; before that the
 * 2026-09-15 blocks that were put down to one-query-per-item loops).
 *
 * By default postgres.js writes a second query onto a connection that is still
 * busy with the first (up to 100 deep) instead of waiting for it. The Supabase
 * transaction pooler does not survive that: the queued query never comes back,
 * and the connection stays wedged with Postgres reporting `active / ClientRead`
 * while the client waits forever. Once all three connections are wedged every
 * later query waits behind them, on every request that shares the instance.
 *
 * Measured against the pooler, outside Next, three connections, queries fired
 * together every round:
 *   - default pipelining, 4 queries: from the second round on, the extras
 *     time out; with 10 queries nothing at all comes back after round 1
 *   - three queries, or `max: 4` for four: fine (nothing queues)
 *   - session mode (port 5432): fine
 *   - `max_pipeline: 1`: still hangs (the first query is not counted, so one
 *     more is still written onto the busy connection)
 *   - `max_pipeline: 0`: 4 and 10 concurrent queries, six rounds each, every
 *     one returned; the extras wait in the client's own queue and run as
 *     connections free up
 *
 * So any page that runs more concurrent queries than `max` — a fourth entry
 * in a Promise.all was enough — hangs unless this is set.
 */
// `max_pipeline` is read by postgres.js (src/connection.js) but missing from its
// type declarations.
type ClientOptions = Options<Record<string, never>> & { max_pipeline: number }

export const clientOptions: ClientOptions = {
  max: 3,
  prepare: false,
  idle_timeout: 20,
  max_pipeline: 0,
  ssl: { rejectUnauthorized: false },
}
