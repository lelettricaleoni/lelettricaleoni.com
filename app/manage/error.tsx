'use client'
import { useEffect, useState } from 'react'
import { unstable_isUnrecognizedActionError } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { canReloadForStaleAction, reloadForStaleAction } from '@/lib/stale-action'

/**
 * What the panel shows when a page throws.
 *
 * The case that matters is a page left open across a deploy: its next save calls an
 * action id the new build does not have, Next throws an "unrecognized action" error
 * out of the transition, and the visitor used to get a bare "This page couldn't
 * load". That one is recovered by loading the new page (lib/stale-action.ts).
 */
export default function ManageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Typed as a plain boolean: the type guard would otherwise narrow `error` to `never` below.
  const stale: boolean = unstable_isUnrecognizedActionError(error)
  // Decided once, at the first render: false when the page reloaded for this a moment ago, so a
  // reload that did not help shows a message instead of looping.
  const [mayReload] = useState(() => canReloadForStaleAction())

  useEffect(() => {
    if (stale && mayReload) reloadForStaleAction()
  }, [stale, mayReload])

  if (stale) {
    return (
      <main className="flex-1 p-8 space-y-4 max-w-xl">
        <h1 className="text-xl font-semibold text-[#1e3a5f]">The site was updated</h1>
        <p className="text-sm text-muted-foreground">
          {mayReload
            ? 'Reloading the page…'
            : 'This page is from before the update. Reload it to carry on; what you had not saved will be lost.'}
        </p>
        {!mayReload && <Button onClick={() => window.location.reload()}>Reload the page</Button>}
      </main>
    )
  }

  return (
    <main className="flex-1 p-8 space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold text-[#1e3a5f]">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The page could not be shown. Trying again often helps; if it keeps happening, reload the page.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    </main>
  )
}
