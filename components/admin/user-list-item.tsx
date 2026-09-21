'use client'
import { useTransition } from 'react'
import { ShieldCheck, ShieldOff, Code2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  grantAdminAction, revokeAdminAction,
  grantDevAccessAction, revokeDevAccessAction,
} from '@/lib/actions/users'
import type { AdminUserSummary } from '@/lib/admin-users'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
          {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Badge variant={user.isAdmin ? 'default' : 'secondary'}>
            {user.isAdmin ? 'Admin' : 'No access'}
          </Badge>
          {user.isAdmin && user.hasDevAccess && (
            <Badge variant="outline">Dev panel</Badge>
          )}
          {user.isPending && <Badge variant="outline">Invite pending</Badge>}
          {lastSignIn && <span>Last sign-in {lastSignIn}</span>}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {user.isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() =>
              user.hasDevAccess ? revokeDevAccessAction(user.id) : grantDevAccessAction(user.id)
            )}
            title={user.hasDevAccess ? 'Remove dev panel access' : 'Grant dev panel access'}
            className={user.hasDevAccess ? 'text-muted-foreground' : ''}
          >
            <Code2 size={16} className="mr-1" />
            {user.hasDevAccess ? 'Dev: yes' : 'Dev: no'}
          </Button>
        )}
        {user.isAdmin ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending || blockedAsLastAdmin}
                title={
                  blockedAsLastAdmin
                    ? 'This is the only account with access: assign it to someone else first'
                    : 'Revoke access'
                }
                className="text-destructive hover:text-destructive"
              >
                <ShieldOff size={16} className="mr-1" /> Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke access?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isSelf
                    ? 'You’ll lose access to this panel immediately. The account stays, but another admin will need to reassign it to you.'
                    : `${user.email} will no longer be able to log into the panel. The account stays and access can be reassigned at any time.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => run(() => revokeAdminAction(user.id))}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Revoke
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
            title="Grant access"
          >
            <ShieldCheck size={16} className="mr-1" /> Grant access
          </Button>
        )}
      </div>
    </div>
  )
}
