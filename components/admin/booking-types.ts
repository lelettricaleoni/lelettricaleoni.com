import type { getPublishedModelsWithAllowedOptions } from '@/lib/actions/bike-units'

/** A published model with the sizes and versions it allows, as the Shop and the rental form need it. */
export type ModelOption = Awaited<ReturnType<typeof getPublishedModelsWithAllowedOptions>>[number]
