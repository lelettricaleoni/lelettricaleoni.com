'use client'
import { useEffect } from 'react'
import { unstable_isUnrecognizedActionError } from 'next/navigation'
import { reloadForStaleAction } from '@/lib/stale-action'

/**
 * Reloads the panel when a Server Action call comes back as "not found", which is
 * what a page left open across a deploy gets (see lib/stale-action.ts).
 *
 * Covers actions awaited in a plain event handler, whose rejection reaches nobody.
 * The ones run inside a transition or useActionState are thrown to the error
 * boundary instead: app/manage/error.tsx.
 */
export function StaleActionGuard() {
  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      if (!unstable_isUnrecognizedActionError(event.reason)) return
      event.preventDefault()
      reloadForStaleAction()
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])
  return null
}
