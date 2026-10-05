'use client'
import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, KeyRound, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { GuideSteps } from '@/components/admin/integrations/guide-steps'
import {
  removeCredentialsAction, saveGoogleCalendarKeyAction, saveGoogleCalendarSettingsAction, testGoogleCalendarAction,
  type TestResult,
} from '@/lib/actions/integrations'
import { completedSteps } from '@/lib/integrations/google-calendar/guide'
import type { IntegrationView } from '@/lib/integrations/view'

const ID = 'google-calendar'

/**
 * The Settings tab: the guide on the left, the form on the right, so each step is followed and filled in
 * without changing page. The key goes up in a form and is never shown again; only the service account e-mail
 * and "Key saved" come back.
 */
export function GoogleCalendarSettings({ view, encryptionConfigured }: { view: IntegrationView; encryptionConfigured: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [keyError, setKeyError] = useState<string | null>(null)
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [calendarId, setCalendarId] = useState(view.calendarId)
  const [includePhone, setIncludePhone] = useState(view.includePhone)
  const [includeMaintenance, setIncludeMaintenance] = useState(view.includeMaintenance)
  const keyForm = useRef<HTMLFormElement>(null)

  const completed = completedSteps({
    hasSecret: view.hasSecret, calendarId: view.calendarId, connectionOk: view.connectionOk,
    testedCalendarId: view.testedCalendarId, enabled: view.enabled,
  })

  function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setKeyError(null)
    setTestResult(null)
    startTransition(async () => {
      const result = await saveGoogleCalendarKeyAction(form)
      if (result.status === 'saved') {
        keyForm.current?.reset()
        toast.success('Key saved')
      } else if (result.status === 'invalid') {
        setKeyError(result.message)
      } else {
        setKeyError('Saving keys is not available on this server yet: secure storage is not set up.')
      }
    })
  }

  function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    setSettingsMessage(null)
    setTestResult(null)
    startTransition(async () => {
      const result = await saveGoogleCalendarSettingsAction({ calendarId, includePhone, includeMaintenance })
      setSettingsMessage(result.status === 'saved' ? { ok: true, text: 'Settings saved' } : { ok: false, text: result.message })
    })
  }

  function test() {
    setTestResult(null)
    startTransition(async () => setTestResult(await testGoogleCalendarAction()))
  }

  function removeCredentials() {
    startTransition(async () => {
      const result = await removeCredentialsAction(ID)
      if (result.status === 'ok') toast.success('Credentials removed. The integration is off.')
      else toast.error(result.message)
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="guide-heading" className="space-y-4">
        <h2 id="guide-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Setup guide</h2>
        <GuideSteps completed={completed} />
      </section>

      <div className="space-y-8">
        {!encryptionConfigured && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>Keys cannot be saved yet</AlertTitle>
            <AlertDescription>Secure storage is not set up on this server, so a key would not be protected. Nothing will be saved until it is.</AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="key-heading" className="space-y-3">
          <h2 id="key-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">1 · Service account key</h2>
          {view.hasSecret && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-emerald-700" aria-hidden />
                <div>
                  <p className="font-medium">Key saved</p>
                  {view.serviceAccountEmail && <p className="break-all text-muted-foreground">{view.serviceAccountEmail}</p>}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={isPending}>Remove credentials</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove the credentials?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The key is deleted and the integration is switched off. Events already in the calendar stay there. You can upload a key again at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep them</AlertDialogCancel>
                    <AlertDialogAction onClick={removeCredentials}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <form ref={keyForm} onSubmit={saveKey} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="key-file">{view.hasSecret ? 'Replace the key: choose the new .json file' : 'Choose the .json file you downloaded'}</Label>
              <Input id="key-file" name="keyFile" type="file" accept=".json,application/json" disabled={!encryptionConfigured} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-text">Or paste its text</Label>
              <Textarea id="key-text" name="keyText" rows={4} spellCheck={false} autoComplete="off" disabled={!encryptionConfigured} placeholder='{"type": "service_account", ...}' className="font-mono text-xs" />
            </div>
            {keyError && <p role="alert" className="text-sm text-destructive">{keyError}</p>}
            <Button type="submit" disabled={isPending || !encryptionConfigured}>Save key</Button>
          </form>
        </section>

        <form onSubmit={saveSettings} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">2 · Calendar and options</h2>
          <div className="space-y-1">
            <Label htmlFor="calendar-id">Calendar ID</Label>
            <Input id="calendar-id" value={calendarId} onChange={(event) => setCalendarId(event.target.value)} maxLength={200} spellCheck={false} placeholder="abc123@group.calendar.google.com" />
            <p className="text-xs text-muted-foreground">Google Calendar → the calendar&apos;s Settings → Integrate calendar → Calendar ID.</p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="include-phone">Include the customer&apos;s phone number</Label>
              <p className="text-xs text-muted-foreground">Adds it to the description of the event, handy to call from the phone. The amount and your private notes are never sent.</p>
            </div>
            <Switch id="include-phone" checked={includePhone} onCheckedChange={setIncludePhone} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="include-maintenance">Include maintenance</Label>
              <p className="text-xs text-muted-foreground">Bikes in maintenance appear in the calendar too, with the reason if you wrote one.</p>
            </div>
            <Switch id="include-maintenance" checked={includeMaintenance} onCheckedChange={setIncludeMaintenance} />
          </div>
          {settingsMessage && (
            <p role={settingsMessage.ok ? 'status' : 'alert'} className={settingsMessage.ok ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>{settingsMessage.text}</p>
          )}
          <Button type="submit" disabled={isPending}>Save settings</Button>
        </form>

        <section aria-labelledby="test-heading" className="space-y-3">
          <h2 id="test-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">3 · Test</h2>
          <p className="text-sm text-muted-foreground">Reads the calendar, creates a small test event and removes it. Save the key and the settings first.</p>
          <Button type="button" variant="outline" onClick={test} disabled={isPending || !view.hasSecret}>Test connection</Button>
          {testResult?.status === 'ok' && (
            <Alert>
              <CheckCircle2 className="size-4 text-emerald-700" />
              <AlertTitle>The connection works</AlertTitle>
              <AlertDescription>{testResult.warning ?? 'Now press Enable at the top of the page.'}</AlertDescription>
            </Alert>
          )}
          {(testResult?.status === 'failed' || testResult?.status === 'invalid') && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertTitle>The test did not pass</AlertTitle>
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </div>
  )
}
