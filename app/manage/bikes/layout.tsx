import { AdminShell } from '@/components/admin/admin-shell'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function BikeModelsLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
