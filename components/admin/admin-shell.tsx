import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'

/**
 * The chrome around every page of the panel.
 *
 * It lives here rather than in `app/manage/layout.tsx` because the login and
 * password pages sit under `/manage` too, and they must not show a sidebar
 * that navigates somewhere the visitor cannot go yet.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
      <Toaster richColors />
    </div>
  )
}
