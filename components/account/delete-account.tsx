'use client'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccountAction } from '@/lib/actions/account'

/**
 * Deleting the account takes a dialog and the typed email address, so a stray click cannot do it. The button of the
 * dialog stays off until what was typed is the address of the account; the server checks it again.
 */
export function DeleteAccount({
  lang,
  email,
  labels,
}: {
  lang: string
  email: string
  labels: { open: string; title: string; description: string; confirm: string; cancel: string; submit: string }
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <AlertDialog onOpenChange={() => setTyped('')}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">{labels.open}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={deleteAccountAction} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>{labels.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">{labels.confirm}</Label>
            <Input
              id="delete-confirm"
              name="confirm"
              type="email"
              autoComplete="off"
              placeholder={email}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{labels.cancel}</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches}>{labels.submit}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
