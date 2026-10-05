import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { IntegrationStatus } from '@/lib/integrations/status'

const LABELS: Record<IntegrationStatus, string> = {
  'not-enabled': 'Not enabled',
  enabled: 'Enabled',
  'needs-attention': 'Needs attention',
}

const STYLES: Record<IntegrationStatus, string> = {
  'not-enabled': 'bg-muted text-muted-foreground hover:bg-muted',
  enabled: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  'needs-attention': 'bg-amber-100 text-amber-900 hover:bg-amber-100',
}

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  return <Badge variant="secondary" className={cn('font-medium', STYLES[status])}>{LABELS[status]}</Badge>
}
