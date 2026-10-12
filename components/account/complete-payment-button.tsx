'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { resumeCheckoutAction } from '@/lib/actions/rent'

export interface CompletePaymentLabels {
  button: string
  errors: Record<string, string>
}

/**
 * "Complete payment" on a booking that is waiting for it: the action sends the person back to the payment page (it redirects, so a good
 * answer never comes back here). What does come back is the reason there is nothing to pay any more, written under the button.
 */
export function CompletePaymentButton({
  bookingId, lang, labels,
}: { bookingId: string; lang: 'it' | 'en' | 'de'; labels: CompletePaymentLabels }) {
  const [pending, startPay] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pay() {
    setError(null)
    startPay(async () => {
      const result = await resumeCheckoutAction(bookingId, lang)
      setError(labels.errors[result.status] ?? labels.errors.invalid_request)
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={pay}>{labels.button}</Button>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}
