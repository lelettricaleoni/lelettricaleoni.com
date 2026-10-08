import { LuCalendarDays } from 'react-icons/lu'
import type { IntegrationIcon } from '@/lib/integrations/registry'

const ICONS = { calendar: LuCalendarDays } satisfies Record<IntegrationIcon, typeof LuCalendarDays>

/** The registry holds a name; this is where it becomes a component. */
export function IntegrationIconBox({ icon, className }: { icon: IntegrationIcon; className?: string }) {
  const Icon = ICONS[icon]
  return (
    <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] ${className ?? ''}`}>
      <Icon size={20} aria-hidden />
    </div>
  )
}
