'use client'
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteAdminAction, type UserActionResult } from '@/lib/actions/users'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="bg-[#1e3a5f] hover:bg-[#152c4a]">
      <Mail size={16} className="mr-1" />
      {pending ? 'Invio…' : 'Invita'}
    </Button>
  )
}

export function InviteUserForm() {
  const [state, formAction] = useActionState<UserActionResult | null, FormData>(
    inviteAdminAction,
    null
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success(state.message)
      formRef.current?.reset()
    } else {
      toast.error(state.message)
    }
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="p-4 bg-card border rounded-lg space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Invita una persona</Label>
        <p className="text-sm text-muted-foreground">
          Riceverà un&apos;email con un link per scegliere la password. Da quel momento potrà
          entrare nel pannello.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="nome@esempio.it"
        />
        <SubmitButton />
      </div>
      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">{state.message}</p>
      )}
    </form>
  )
}
