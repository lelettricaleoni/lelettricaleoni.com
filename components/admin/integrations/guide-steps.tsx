import { Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GUIDE_STEPS } from '@/lib/integrations/google-calendar/guide'

/**
 * The setup guide as a numbered list. A step the panel can tell is done is ticked; a step that matches a field of
 * the form says which one. Plain markup (no hooks), so it renders on the server and inside the settings form alike.
 */
export function GuideSteps({ completed }: { completed: string[] }) {
  return (
    <ol className="space-y-5">
      {GUIDE_STEPS.map((step, index) => {
        const done = completed.includes(step.id)
        return (
          <li key={step.id} className="flex gap-3" data-done={done}>
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 text-muted-foreground',
              )}
            >
              {done ? <Check size={14} /> : index + 1}
            </span>
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-sm font-semibold">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
                {done && <span className="sr-only"> (done)</span>}
              </h3>
              {step.todo.map((paragraph) => (
                <p key={paragraph} className="text-sm text-muted-foreground">{paragraph}</p>
              ))}
              {step.links && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {step.links.map((link) => (
                    <a
                      key={link.href} href={link.href} target="_blank" rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[#366DA1] underline-offset-2 hover:underline"
                    >
                      {link.label}<ExternalLink size={12} aria-hidden />
                    </a>
                  ))}
                </p>
              )}
              <p className="text-xs text-muted-foreground"><span className="font-medium">What you should see:</span> {step.see}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
