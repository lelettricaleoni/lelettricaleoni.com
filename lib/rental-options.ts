/**
 * What the rental form offers: the models, sizes and versions of the bikes that are really in the
 * shop, not the ones a model is allowed to have on paper (the shop's "Add bike" form is the one
 * that works from the allowed set). Pure helpers here; the query is in rental-options-data.ts.
 */
export interface RentalVersion { id: string; name: string }
export interface RentalSize { id: string; name: string; versions: RentalVersion[] }
export interface RentalOption { modelId: string; modelName: string; sizes: RentalSize[] }

export function sizesOf(options: RentalOption[], modelId: string): RentalSize[] {
  return options.find((option) => option.modelId === modelId)?.sizes ?? []
}

/** Only the versions that exist in that size: a model may come in Alu and Carbon, but not in every size. */
export function versionsOf(options: RentalOption[], modelId: string, sizeId: string): RentalVersion[] {
  return sizesOf(options, modelId).find((size) => size.id === sizeId)?.versions ?? []
}

/** The id to preselect when there is exactly one choice; never a guess when there are several. */
export function onlyChoice(choices: { id: string }[]): string {
  return choices.length === 1 ? choices[0].id : ''
}
