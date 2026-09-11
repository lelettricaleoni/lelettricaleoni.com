import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { getUsersForAdmin } from '@/lib/actions/users'
import { countAdmins } from '@/lib/admin-users'
import { InviteUserForm } from '@/components/admin/invite-user-form'
import { UserListItem } from '@/components/admin/user-list-item'

export default async function AdminUsersPage() {
  const currentUser = await getAdminUser()
  if (!currentUser) redirect('/manage/login')

  const users = await getUsersForAdmin()
  // The last admin cannot lose the role. The list is told so up front, so the
  // button is disabled with a reason instead of failing on the click.
  const isLastAdmin = countAdmins(users) <= 1

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Access</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chi può entrare in questo pannello e gestire i percorsi.
        </p>
      </div>

      <InviteUserForm />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Account ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nessun account.</p>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <UserListItem
                key={user.id}
                user={user}
                isSelf={user.id === currentUser.id}
                isLastAdmin={isLastAdmin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
