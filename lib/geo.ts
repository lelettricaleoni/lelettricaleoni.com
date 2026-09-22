/**
 * Distanza in km tra due punti su una sfera — stessa formula già in uso in
 * lib/gpx.ts (dove viene calcolata la distanza totale di un percorso durante
 * il parsing), spostata qui perché serve anche lato client, dove
 * lib/gpx.ts non va importato: trascina dentro fast-xml-parser, che un
 * componente client non deve scaricare solo per una formula di geometria.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Distanza cumulata in km ad ogni punto del tracciato — stessa lunghezza di
 * `points`, il primo valore sempre 0. Usata per l'asse X del grafico
 * altimetrico e per l'etichetta quota/distanza durante lo scrub.
 */
export function cumulativeDistancesKm(points: [number, number, number][]): number[] {
  if (points.length === 0) return []
  const distances: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]
    const [lon2, lat2] = points[i]
    distances.push(distances[i - 1] + haversineKm(lat1, lon1, lat2, lon2))
  }
  return distances
}
