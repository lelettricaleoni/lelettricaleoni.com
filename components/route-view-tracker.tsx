'use client'
import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

export function RouteViewTracker({
  routeId,
  difficulty,
}: {
  routeId: string
  difficulty?: string | null
}) {
  useEffect(() => {
    trackEvent('route_view', { route_id: routeId, ...(difficulty && { difficulty }) })
  }, [routeId, difficulty])

  return null
}
