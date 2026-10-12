'use client'

import { useState, useTransition } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cancelBikeAction, type CancelBikeActionResult } from '@/lib/actions/rent'
import { fill } from '@/lib/booking/format'
import { formatPrice } from '@/lib/money'

export interface CancelLabels {
  button: string
  title: string
  body: string
  confirm: string
  keep: string
  done: string
  doneNothing: string
  errors: Record<string, string>
}

/**
 * "Cancel this bike": the window says how much comes back and until when, and only the confirmation does it. The answer, good or bad,
 * is written under the button; the page behind is refreshed by the action itself, so the bike turns "Cancelled" on its own.
 */
export function CancelBikeButton({
  reservationId, lang, amountCents, deadlineLabel, helpEmail, labels,
}: {
  reservationId: string
  lang: 'it' | 'en' | 'de'
  amountCents: number
  deadlineLabel: string
  helpEmail: string
  labels: CancelLabels
}) {
  const [open, setOpen] = useState(false)
  const [pending, startCancel] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const amount = formatPrice(amountCents, lang)

  function cancel() {
    setMessage(null)
    startCancel(async () => {
      const result: CancelBikeActionResult = await cancelBikeAction(reservationId, lang)
      setOpen(false)
      if (result.status === 'cancelled') {
        setMessage({ kind: 'ok', text: result.refundedCents > 0 ? fill(labels.done, { amount: formatPrice(result.refundedCents, lang) }) : labels.doneNothing })
        return
      }
      const text = labels.errors[result.status] ?? labels.errors.refund_failed
      setMessage({ kind: 'error', text: fill(text, { email: helpEmail }) })
    })
  }

  return (
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">{labels.button}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>{fill(labels.body, { amount, deadline: deadlineLabel })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{labels.keep}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              // The action closes the window itself once it has an answer: a click must not close it before.
              onClick={(event) => { event.preventDefault(); cancel() }}
            >
              {labels.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error'
            ? 'rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700'
            : 'rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700'}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
