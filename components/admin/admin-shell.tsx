import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'
import { getAdminUser } from '@/lib/supabase/server'
import { hasDevAccess } from '@/lib/admin-users'

/**
 * The chrome around every page of the panel.
 *
 * It lives here rather than in `app/manage/layout.tsx` because the login and
 * password pages sit under `/manage` too, and they must not show a sidebar
 * that navigates somewhere the visitor cannot go yet.
 *
 * Reads the user itself, independently of whatever check the page inside it
 * already did, for the same reason every Server Action re-checks admin
 * rather than trusting a caller: the Dev entry in the sidebar must not
 * appear for someone who cannot use it, even if some future page forgets
 * its own check.
 */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await getAdminUser()

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar hasDevAccess={Boolean(user && hasDevAccess(user))} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
      <Toaster richColors />
    </div>
  )
}
