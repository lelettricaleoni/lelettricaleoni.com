import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { hasDevAccess } from '@/lib/admin-users'
import { readWorkerHeartbeat, type ActiveJob, type WorkerHeartbeat } from '@/lib/worker-heartbeat'
import { getRedisStats, getPostgresStats, getR2Stats } from '@/lib/dev-stats'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The worker reports a load average, not a live percentage — Linux has
 * nothing cheaper that means "current", since instantaneous CPU use swings
 * too fast per-sample to be a useful number. Dividing by core count turns it
 * into the 0-100% shape people actually read at a glance; it is a 1-minute
 * average, not the instant this page loaded, which the hint under it says.
 */
function cpuUsagePercent(h: WorkerHeartbeat): number | null {
  const load1m = h.load['1m']
  if (load1m === undefined || !h.cpuCount) return null
  return Math.min(100, Math.round((load1m / h.cpuCount) * 100))
}

function formatAgo(epochMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}min ago`
  return `${Math.round(minutes / 60)}h ago`
}

function formatDuration(epochMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}min ${rest}s` : `${rest}s`
}

function jobLabel(job: ActiveJob): string {
  const data = job.data
  if (data && typeof data === 'object' && 'key' in data && typeof (data as { key: unknown }).key === 'string') {
    return (data as { key: string }).key
  }
  return job.id
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-[#1e3a5f] mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[#1e3a5f]">{title}</h2>
      {children}
    </section>
  )
}

export default async function DevToolsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')
  if (!hasDevAccess(user)) redirect('/manage')

  const [heartbeat, redisStats, pgStats, r2Stats] = await Promise.all([
    readWorkerHeartbeat(),
    getRedisStats(),
    getPostgresStats(),
    getR2Stats(),
  ])

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Dev</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status of the services behind the site. Read-only, refreshes on every visit.
        </p>
      </div>

      <Section title="Video worker">
        {!heartbeat ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            No data from the worker. It hasn&apos;t published a heartbeat yet, or it&apos;s
            been down for more than a minute.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Updated {formatAgo(heartbeat.updatedAt)}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="CPU"
                value={cpuUsagePercent(heartbeat) !== null ? `${cpuUsagePercent(heartbeat)}%` : '—'}
                hint={heartbeat.cpuCount ? `${heartbeat.cpuCount} cores, 1min avg` : undefined}
              />
              <StatCard
                label="Memory"
                value={heartbeat.memory ? `${heartbeat.memory.usedMb} MB` : '—'}
                hint={heartbeat.memory ? `of ${heartbeat.memory.totalMb} MB` : undefined}
              />
              <StatCard
                label="Active queues"
                value={`${Object.keys(heartbeat.queues).length}`}
              />
            </div>

            {Object.entries(heartbeat.queues).map(([name, queue]) => (
              <div key={name} className="rounded-lg border bg-card p-4 space-y-3">
                <p className="text-sm font-medium text-[#1e3a5f]">{name}</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><span className="font-semibold">{queue.counts.waiting ?? 0}</span> waiting</span>
                  <span><span className="font-semibold">{queue.counts.active ?? 0}</span> active</span>
                  <span><span className="font-semibold">{queue.counts.completed ?? 0}</span> completed</span>
                  <span><span className="font-semibold">{queue.counts.failed ?? 0}</span> failed</span>
                  <span><span className="font-semibold">{queue.counts.delayed ?? 0}</span> delayed</span>
                </div>
                {queue.active.length > 0 && (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {queue.active.map((job) => (
                      <li key={job.id} className="truncate">
                        {jobLabel(job)}
                        {job.startedAt && ` — running for ${formatDuration(job.startedAt)}`}
                        {job.attempt > 1 && ` (attempt ${job.attempt})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Cron">
        {!heartbeat || heartbeat.schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            No scheduled jobs right now.
          </p>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {heartbeat.schedules.map((s) => (
              <div key={s.id} className="p-3 text-sm flex items-center justify-between gap-4">
                <span className="font-medium text-[#1e3a5f]">{s.id}</span>
                <span className="text-muted-foreground font-mono text-xs">{s.pattern}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Redis">
        {!redisStats ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            Not configured or unreachable.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total keys" value={`${redisStats.totalKeys}`} />
            <StatCard label="Tracked video jobs" value={`${redisStats.trackedJobs}`} />
          </div>
        )}
      </Section>

      <Section title="Database">
        {!pgStats ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            Unreachable right now.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Size" value={`${pgStats.databaseSizeMb} MB`} />
            <StatCard label="Connections" value={`${pgStats.connections}`} />
            <StatCard label="Routes" value={`${pgStats.routeCount}`} />
            <StatCard label="Photos/videos" value={`${pgStats.photoCount}`} />
            <StatCard label="Translations" value={`${pgStats.translationCount}`} />
          </div>
        )}
      </Section>

      <Section title="Storage (R2)">
        {!r2Stats ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            Not configured or unreachable.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Objects" value={`${r2Stats.objectCount}`} hint={r2Stats.bucketName} />
            <StatCard label="Size" value={`${r2Stats.sizeMb} MB`} hint="yesterday's figure, not real-time" />
          </div>
        )}
      </Section>
    </div>
  )
}
