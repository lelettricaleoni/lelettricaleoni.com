'use client'
import { useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Calls `onChange` when a reservation changes anywhere, when the connection comes back after a
 * drop, and when the tab becomes visible again. The ping carries no data worth trusting: the
 * caller just reloads what it shows.
 */
export function useReservationsRealtime(onChange: () => void) {
  const latest = useRef(onChange)
  useEffect(() => { latest.current = onChange })

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let connectedBefore = false

    const channel = supabase
      .channel('reservations')
      .on('broadcast', { event: 'changed' }, () => latest.current())
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // The first connection is the initial page load: nothing to reload.
        if (connectedBefore) latest.current()
        connectedBefore = true
      })

    const onVisible = () => { if (document.visibilityState === 'visible') latest.current() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [])
}
