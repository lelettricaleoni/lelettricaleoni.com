'use client'
import { useTransition } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { grantAdminAction, revokeAdminAction } from '@/lib/actions/users'
import type { AdminUserSummary } from '@/lib/admin-users'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function UserListItem({
  user,
  isSelf,
  isLastAdmin,
}: {
  user: AdminUserSummary
  isSelf: boolean
  /** True when this account is the only one left with access. */
  isLastAdmin: boolean
}) {
  const [isPending, startTransition] = useTransition()

  // The server refuses this too — it is the check that counts, because the
  // list here can be a minute old. Disabling the button only spares the click.
  const blockedAsLastAdmin = user.isAdmin && isLastAdmin

  function run(work: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await work()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    })
  }

  const lastSignIn = formatDate(user.lastSignInAt)

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg gap-4">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">
          {user.email || '—'}
          {isSelf && <span className="text-muted-foreground font-normal"> (tu)</span>}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Badge variant={user.isAdmin ? 'default' : 'secondary'}>
            {user.isAdmin ? 'Amministratore' : 'Nessun accesso'}
          </Badge>
          {user.isPending && <Badge variant="outline">Invito in attesa</Badge>}
          {lastSignIn && <span>Ultimo accesso {lastSignIn}</span>}
        </div>
      </div>

      <div className="shrink-0">
        {user.isAdmin ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending || blockedAsLastAdmin}
                title={
                  blockedAsLastAdmin
                    ? "È l'unico account con accesso: assegnalo prima a qualcun altro"
                    : 'Revoca accesso'
                }
                className="text-destructive hover:text-destructive"
              >
                <ShieldOff size={16} className="mr-1" /> Revoca
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revocare l&apos;accesso?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isSelf
                    ? 'Perderai subito l’accesso a questo pannello. L’account resta, ma dovrà essere un altro amministratore a riassegnartelo.'
                    : `${user.email} non potrà più entrare nel pannello. L’account resta e l’accesso può essere riassegnato in qualsiasi momento.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => run(() => revokeAdminAction(user.id))}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Revoca
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => grantAdminAction(user.id))}
            title="Assegna accesso"
          >
            <ShieldCheck size={16} className="mr-1" /> Assegna accesso
          </Button>
        )}
      </div>
    </div>
  )
}
