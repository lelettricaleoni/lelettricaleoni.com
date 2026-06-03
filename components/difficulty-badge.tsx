import { cn } from '@/lib/utils'

export const DIFFICULTY_STYLES: Record<string, string> = {
  easy:   'bg-green-100  text-green-800  border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  hard:   'bg-orange-100 text-orange-800 border-orange-200',
  expert: 'bg-red-100    text-red-800    border-red-200',
}

export const DIFFICULTY_ACTIVE_STYLES: Record<string, string> = {
  easy:   'bg-green-500  text-white border-green-500',
  medium: 'bg-yellow-500 text-white border-yellow-500',
  hard:   'bg-orange-500 text-white border-orange-500',
  expert: 'bg-red-500    text-white border-red-500',
}

interface Props {
  difficulty: string
  label: string
  className?: string
}

export function DifficultyBadge({ difficulty, label, className }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
      DIFFICULTY_STYLES[difficulty] ?? 'bg-muted text-muted-foreground border-border',
      className
    )}>
      {label}
    </span>
  )
}
