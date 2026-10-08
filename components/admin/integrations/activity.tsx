'use client'
import { useState, useTransition } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/integrations/status-badge'
import { syncNowAction, type SyncNowActionResult } from '@/lib/actions/integrations'
import { formatWhen } from '@/lib/integrations/format'
import type { IntegrationView } from '@/lib/integrations/view'

/** The Activity tab: how it is doing, and the Sync now button (the whole calendar brought in line with the bookings). */
export function IntegrationActivity({ view }: { view: IntegrationView }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SyncNowActionResult | null>(null)

  function syncNow() {
    setResult(null)
    startTransition(async () => setResult(await syncNowAction()))
  }

  return (
    <div className="space-y-6">
      <dl className="divide-y rounded-lg border text-sm">
        <Row label="Status"><StatusBadge status={view.status} /></Row>
        <Row label="Last connection test">{formatWhen(view.lastCheckedAt)}</Row>
        <Row label="Last synchronisation">{formatWhen(view.lastSyncAt, 'Not yet')}</Row>
        <Row label="Last problem">
          {view.lastError ? <span className="text-destructive">{view.lastError}</span> : <span className="text-muted-foreground">None</span>}
        </Row>
      </dl>

      {view.enabled && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Synchronise now</h2>
          <p className="text-sm text-muted-foreground">
            Bookings are sent to the calendar as you make them. If something is missing or out of date (for example Google
            was unreachable for a moment), this sends every booking from yesterday to a year ahead again and removes the
            events that no longer match a booking. Events you added to the calendar by hand are never touched. It also runs by itself once a day.
          </p>
          <Button type="button" variant="outline" onClick={syncNow} disabled={isPending}>
            <LuRefreshCw size={16} className={isPending ? 'mr-2 animate-spin' : 'mr-2'} aria-hidden />Sync now
          </Button>
          {result?.status === 'done' && (
            <p role="status" className={result.failed > 0 ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>
              {result.failed > 0
                ? `${result.failed} could not be sent. ${result.firstError ?? ''}`
                : `Done: ${result.upserted} sent, ${result.removed} removed.`}
            </p>
          )}
          {result?.status === 'off' && <p role="status" className="text-sm text-muted-foreground">The integration is off.</p>}
        </section>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
