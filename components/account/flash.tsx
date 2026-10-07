/** The notices at the top of an account page: what went wrong, what was done. Colours and shape as everywhere on the site. */
export function Flash({ error, info }: { error?: string | null; info?: string | null }) {
  return (
    <>
      {error && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{error}</div>
      )}
      {info && (
        <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{info}</div>
      )}
    </>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}
