'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegrationActivity } from '@/components/admin/integrations/activity'
import { GoogleCalendarSettings } from '@/components/admin/integrations/google-calendar-settings'
import { GuideSteps } from '@/components/admin/integrations/guide-steps'
import { IntegrationIconBox } from '@/components/admin/integrations/icon'
import { StatusBadge } from '@/components/admin/integrations/status-badge'
import { disableIntegrationAction, enableIntegrationAction } from '@/lib/actions/integrations'
import { completedSteps } from '@/lib/integrations/google-calendar/guide'
import type { IntegrationDefinition } from '@/lib/integrations/registry'
import type { IntegrationView } from '@/lib/integrations/view'

type TabName = 'overview' | 'guide' | 'settings' | 'activity'

/**
 * One integration: its name and status, the Enable / Disable button, and four tabs: Overview (what it does and
 * what it sends), Setup guide, Settings (guide and form side by side) and Activity.
 */
export function IntegrationPage({
  definition, view, encryptionConfigured,
}: { definition: IntegrationDefinition; view: IntegrationView; encryptionConfigured: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<TabName>('overview')

  function enable() {
    startTransition(async () => {
      const result = await enableIntegrationAction(definition.id)
      if (result.status === 'ok') {
        toast.success(`${definition.name} is on`)
        return
      }
      // Not ready yet: say what is missing and take the person to where it is done.
      toast.error(result.message)
      setTab('settings')
    })
  }

  function disable() {
    startTransition(async () => {
      const result = await disableIntegrationAction(definition.id)
      if (result.status === 'ok') toast.success(`${definition.name} is off`)
      else toast.error(result.message)
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/manage/integrations" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={16} /> Integrations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <IntegrationIconBox icon={definition.icon} className="size-12" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[#1e3a5f]">{definition.name}</h1>
              <StatusBadge status={view.status} />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{definition.summary}</p>
          </div>
        </div>
        {view.enabled ? (
          <Button variant="outline" onClick={disable} disabled={isPending}>Disable</Button>
        ) : (
          <Button onClick={enable} disabled={isPending}>Enable</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabName)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guide">Setup guide</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 max-w-3xl space-y-6">
          <p className="text-sm leading-relaxed">{definition.description}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-2 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">What is sent</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {definition.dataSent.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
            <section className="space-y-2 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">What is never done</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {definition.notDone.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          </div>
          {!view.enabled && (
            <p className="text-sm text-muted-foreground">
              To turn it on, follow the <button type="button" className="text-[#366DA1] underline" onClick={() => setTab('settings')}>setup in Settings</button>,
              test the connection, then press Enable.
            </p>
          )}
        </TabsContent>

        <TabsContent value="guide" className="mt-6 max-w-3xl">
          <GuideSteps
            completed={completedSteps({
              hasSecret: view.hasSecret, calendarId: view.calendarId, connectionOk: view.connectionOk,
              testedCalendarId: view.testedCalendarId, enabled: view.enabled,
            })}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <GoogleCalendarSettings view={view} encryptionConfigured={encryptionConfigured} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6 max-w-2xl">
          <IntegrationActivity view={view} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
