import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { INTEGRATIONS } from '@/lib/integrations/registry'
import { integrationStatus } from '@/lib/integrations/status'
import { listIntegrationStates } from '@/lib/integrations/store'
import { IntegrationsCatalog } from '@/components/admin/integrations/catalog'

// Read live: a switch or a failed test must show at once.
export const instant = false

export default async function IntegrationsPage() {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const states = await listIntegrationStates()
  const entries = INTEGRATIONS.map((definition) => ({
    definition,
    status: integrationStatus(states.find((state) => state.id === definition.id) ?? null),
  }))
  return <IntegrationsCatalog entries={entries} />
}
