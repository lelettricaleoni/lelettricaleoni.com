import { AdminShell } from '@/components/admin/admin-shell'

export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
