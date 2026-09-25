import { Children, isValidElement, type ReactNode } from 'react'

/**
 * The homepage sections, with their backgrounds alternating white and grey.
 *
 * Each section used to pick its own background, which cannot work when the
 * sections in between come and go with feature flags: turning the bikes teaser
 * on put two tinted sections side by side, and the price list's grey depended on
 * what happened to sit above it. The stack decides instead, from what is actually
 * there.
 *
 * It counts from the bottom, so the end of the page never moves: the contact
 * section, the last one before the dark footer, is always grey, and the price
 * list above it always white. What changes with the flags is the top. `false`,
 * `null` and `undefined` children (a switched-off section) are skipped.
 */
export function SectionStack({ children }: { children: ReactNode }) {
  const sections = Children.toArray(children)

  return (
    <>
      {sections.map((section, i) => {
        const grey = (sections.length - 1 - i) % 2 === 0
        return (
          <div
            key={isValidElement(section) ? (section.key ?? i) : i}
            className={grey ? 'bg-slate-50' : 'bg-white'}
          >
            {section}
          </div>
        )
      })}
    </>
  )
}
