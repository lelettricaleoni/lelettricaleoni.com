'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { payWithFakeCardAction } from '@/lib/actions/rent'

/** "Pay" and "Back" of the page that stands in for the card form. Paying redirects (to the booking); anything else is said here. */
export function FakePayForm({ sessionId, labels, backHref }: {
  sessionId: string
  labels: { pay: string; back: string; notPayable: string }
  backHref: string
}) {
  const [pending, startPay] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pay() {
    setError(null)
    startPay(async () => {
      const result = await payWithFakeCardAction(sessionId)
      // Not redirected: it could not be paid.
      setError(labels.notPayable)
      void result
    })
  }

  return (
    <div className="space-y-3">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Button type="button" className="w-full" size="lg" disabled={pending} onClick={pay}>{labels.pay}</Button>
      <Button asChild variant="outline" className="w-full"><Link href={backHref}>{labels.back}</Link></Button>
    </div>
  )
}
