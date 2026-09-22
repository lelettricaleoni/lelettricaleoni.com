'use client'
import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

export function BikeViewTracker({
  bikeModelId,
  category,
}: {
  bikeModelId: string
  category?: string | null
}) {
  useEffect(() => {
    trackEvent('bike_view', { bike_model_id: bikeModelId, ...(category && { category }) })
  }, [bikeModelId, category])

  return null
}
