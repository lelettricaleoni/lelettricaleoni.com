/**
 * The same Supabase pooler address, moved to transaction mode.
 *
 * The shared pooler answers both modes on one host with the same credentials:
 * 5432 is session mode, 6543 is transaction mode. The variable on Vercel is a
 * secret nobody can read back, so rather than trust it to name the right port,
 * the port is set here. Anything that is not the shared pooler — a direct
 * connection, a local database — passes through untouched.
 */
export function transactionPoolerUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  if (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432') return raw
  url.port = '6543'
  return url.toString()
}
