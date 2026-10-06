import { notFound, redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/supabase/server'
import { isEncryptionConfigured } from '@/lib/integrations/crypto'
import { getIntegrationDefinition } from '@/lib/integrations/registry'
import { getIntegrationState } from '@/lib/integrations/store'
import { toIntegrationView } from '@/lib/integrations/view'
import { IntegrationPage } from '@/components/admin/integrations/integration-page'

export const instant = false

export default async function IntegrationRoute({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/manage/login')

  const { id } = await params
  const definition = getIntegrationDefinition(id)
  if (!definition) notFound()

  // The browser gets the view: a whitelist of what the page shows, never the secret.
  const view = toIntegrationView(id, await getIntegrationState(id))
  return <IntegrationPage definition={definition} view={view} encryptionConfigured={isEncryptionConfigured()} />
}
