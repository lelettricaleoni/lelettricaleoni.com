import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { IntegrationIconBox } from '@/components/admin/integrations/icon'
import { StatusBadge } from '@/components/admin/integrations/status-badge'
import type { IntegrationDefinition } from '@/lib/integrations/registry'
import type { IntegrationStatus } from '@/lib/integrations/status'

export interface CatalogEntry {
  definition: IntegrationDefinition
  status: IntegrationStatus
}

/** All the integrations, as cards: icon, name, what it does, and whether it is on. A click opens its page. */
export function IntegrationsCatalog({ entries }: { entries: CatalogEntry[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect the panel to outside services. Each one has its own page with an explanation, a step by step guide and its settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map(({ definition, status }) => (
          <Link
            key={definition.id}
            href={`/manage/integrations/${definition.id}`}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors group-hover:border-[#366DA1]">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <IntegrationIconBox icon={definition.icon} />
                  <StatusBadge status={status} />
                </div>
                <div className="space-y-1">
                  <h2 className="font-semibold">{definition.name}</h2>
                  <p className="text-sm text-muted-foreground">{definition.summary}</p>
                </div>
                <p className="mt-auto pt-1 text-xs text-muted-foreground">{definition.category}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
