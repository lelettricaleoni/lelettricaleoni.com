import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next'
import { definitions } from '@/lib/flags'

/**
 * Flags discovery endpoint.
 *
 * Vercel calls this on each production deployment to learn which flags the
 * code declares. Flags it finds here that do not exist in the dashboard show
 * up as drafts to promote; flags in the dashboard that stop appearing here get
 * marked unreferenced. Without this endpoint the dashboard stays empty and
 * every flag falls back to the defaultValue in the code.
 *
 * Access is verified with FLAGS_SECRET, so the endpoint does not expose the
 * flag list publicly.
 *
 * Uses getProviderData from `flags/next`, which describes the declarations in
 * the code, rather than the adapter's version, which asks the Vercel Flags
 * service for its definitions and fails with "No flag definitions available"
 * while the dashboard is still empty — precisely the state this endpoint is
 * meant to get us out of.
 */
export const GET = createFlagsDiscoveryEndpoint(async () => getProviderData(definitions))
