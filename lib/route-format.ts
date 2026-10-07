/**
 * A route's distance as it is read by a person. `distance_km` is `numeric(6,2)`,
 * so it comes out of the database as "63.50": printed as is it showed a dot and a
 * trailing zero, and on a card — three stats in a row — it did not fit.
 *
 * `whole` is for the list cards, `detail` for the route page, which has the room
 * for one decimal and the separator of the language (63,5 in Italian and German).
 */
export function formatRouteKm(km: string | number, lang: string, precision: 'whole' | 'detail'): string {
  return new Intl.NumberFormat(lang, {
    maximumFractionDigits: precision === 'whole' ? 0 : 1,
  }).format(Number(km))
}
