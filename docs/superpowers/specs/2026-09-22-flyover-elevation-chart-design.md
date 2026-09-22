# Design Spec — Grafico altimetrico per il flyover 3D

**Data**: 2026-09-22
**Branch**: `main`
**Stato**: approvato, pronto per il piano di implementazione

---

## Obiettivo

Aggiungere un profilo altimetrico interattivo alla sezione flyover 3D del dettaglio
percorso (`components/route-flyover.tsx`), sincronizzato in entrambe le direzioni con la
mappa: durante il volo automatico il grafico avanza mostrando la quota corrente, e
trascinando il grafico si sposta un marker sulla mappa senza dover avviare il volo. Deve
funzionare bene sia a mouse sia a dito, e non deve appesantire il caricamento iniziale
della pagina.

### Dentro questa fase

- Grafico quota/distanza nella sezione flyover esistente, dentro un pannello a scomparsa
  chiuso di default
- Sincronizzazione bidirezionale: volo → grafico avanza; trascinamento sul grafico →
  marker sulla mappa si sposta (senza muovere la camera, senza avviare il volo)
- Trascinare il grafico mentre il volo è in corso ferma il volo e prende il controllo
  manuale da quel punto (stesso comportamento del bottone "Stop" di oggi)
- Caricamento differito: sia il codice del grafico sia l'entità marker sulla mappa
  arrivano solo quando servono davvero

### Fuori da questa fase

- Controllo di velocità del flyover (0.5x/1x/2x) — deciso esplicitamente da Kevin di
  rimandarlo, la struttura lo permette senza modifiche (il moltiplicatore del clock
  Cesium esiste già)
- Limitare l'area esplorabile della mappa a una zona attorno al tracciato — richiesto da
  Kevin come lavoro *successivo* e separato, avrà un proprio spec
- Avvio del volo da un punto scelto trascinando il grafico (il volo parte sempre
  dall'inizio, come oggi) — trascinare durante l'idle sposta solo il marker, non prepara
  un punto di partenza per un volo successivo
- Scorrimento da tastiera del grafico (accessibilità oltre mouse/touch)

---

## Decisioni chiave, e perché

**shadcn/ui Chart (Recharts) invece di una libreria dedicata.** Non esiste una vera
libreria "per grafici GPX" — solo librerie generiche o plugin specifici di altri motori
mappa (es. Leaflet), irrilevanti qui con Cesium. shadcn è già il sistema UI del progetto e
Recharts gestisce touch e mouse di serie.

**Il grafico stesso è la barra di scorrimento — non due controlli separati.** Deciso da
Kevin dopo aver riletto la propria richiesta: un video-player con barra del tempo e il
trascinamento diretto sul grafico non sono alternative, sono lo stesso controllo visto da
due angolazioni. Un solo pezzo di codice per entrambe le modalità, non due sincronizzate a
mano.

**Trascinare il grafico muove il marker, mai la camera.** L'utente esplora liberamente la
vista già presente; solo il bottone play avvia il volo vero e proprio (camera che
insegue). Evita scatti di camera ad ogni pixel di trascinamento, che sarebbero sia costosi
sia disorientanti.

**Un solo marker sulla mappa, non due.** Oggi `startFlyover()` crea una propria entità
punto (`entityRef`) ad ogni volo. Invece di aggiungere un secondo marker per il
trascinamento manuale, i due percorsi condividono la stessa entità (rinominata
concettualmente "cursore"), creata la prima volta che serve — sia che sia il volo a
partire per primo, sia che sia un trascinamento sul grafico.

**La sincronizzazione non passa da React ad ogni frame.** Durante il volo la posizione
cambia 60 volte al secondo; passarla da uno stato React ricalcolerebbe il grafico 60 volte
al secondo. Invece: sia il gestore `postUpdate` del volo sia il trascinamento sul grafico
chiamano la stessa funzione imperativa, che sposta direttamente l'entità Cesium e un
elemento posizionato via CSS sopra il grafico (mai ridisegnato da Recharts) — lo stesso
identico percorso di codice per entrambe le modalità. Lo stesso vale per l'etichetta
quota/distanza mostrata vicino al cursore: aggiornata scrivendo `textContent` su un `ref`,
non con `setState`. Lo stato React (`scrubbing: boolean`, `flying` già esistente) cambia
solo su eventi poco frequenti — inizio/fine trascinamento, stop del volo — mai ad ogni
frame.

**L'asse Y usa le quote ancorate al terreno, non le quote grezze del GPX.** Sono le stesse
quote già disegnate per il tracciato 3D (`heightsRef.current` in `route-flyover.tsx`, già
motivate nella decisione "La traccia GPX si ancora al terreno" in STATE.md). Così il
grafico e la mappa raccontano sempre lo stesso numero — se mostrassi le quote GPX grezze
sul grafico ma il terreno sulla mappa, i due potrebbero non coincidere esattamente nei
punti dove il DEM si scosta dalla lettura GPS.

**`haversineKm` si sposta da `lib/gpx.ts` a un nuovo `lib/geo.ts`, condiviso invece di
duplicato.** `lib/gpx.ts` esiste per il parsing lato server (usa `fast-xml-parser`) e non
va importato in un componente client; la formula della distanza serve invece anche per
l'asse X del grafico, lato client. Stessa formula, una sola definizione.

**Pannello chiuso di default, con doppio livello di caricamento differito.** Cesium è già
dietro un `next/dynamic({ ssr:false })` (`RouteFlyoverLoader`). Il grafico aggiunge un
secondo livello dentro `RouteFlyover` stesso: il bundle di Recharts si scarica solo
all'apertura del pannello, non al caricamento della pagina — nessun peso aggiuntivo per chi
non apre mai il grafico.

---

## Architettura

### File coinvolti

```
lib/geo.ts                          (nuovo)   haversineKm, cumulativeDistancesKm
lib/gpx.ts                          (modifica) importa haversineKm da lib/geo.ts
lib/geo.test.ts                     (nuovo)   test su cumulativeDistancesKm
components/route-elevation-chart.tsx (nuovo)  grafico Recharts, drag/hover, cursore CSS
components/route-flyover.tsx        (modifica) pannello a scomparsa, entità cursore condivisa,
                                                funzioni imperative di sincronizzazione
messages/it.json, en.json, de.json  (modifica) 3 nuove chiavi in "routes" (vedi sotto)
```

Più `npx shadcn@latest add chart collapsible` (Recharts + `@radix-ui/react-collapsible`
come nuove dipendenze, coerente con "librerie prima del custom").

### `lib/geo.ts`

```ts
export function haversineKm(lat1, lon1, lat2, lon2): number  // spostata da lib/gpx.ts, invariata

/**
 * Distanza cumulata in km ad ogni punto del tracciato, il primo sempre 0.
 * Stessa lunghezza di `points`.
 */
export function cumulativeDistancesKm(points: [number, number, number][]): number[]
```

`lib/gpx.ts` importa `haversineKm` da qui invece di definirla localmente — nessun'altra
modifica al suo comportamento.

### `components/route-elevation-chart.tsx`

Componente client presentazionale, **senza alcuna conoscenza di Cesium**: riceve dati e
due funzioni di callback, non sa nulla della mappa.

```ts
interface RouteElevationChartProps {
  points: [number, number, number][]   // per l'asse X (distanza)
  heights: number[]                     // per l'asse Y (quota ancorata al terreno)
  difficulty?: string                   // colore del grafico, stesso di DIFFICULTY_COLORS
  onScrubStart: () => void              // inizio trascinamento — segnala "prendi il controllo"
  onScrubMove: (index: number) => void  // ad ogni pixel di trascinamento/hover
  onScrubEnd: () => void
  registerCursorUpdater: (fn: (index: number) => void) => void
    // il genitore chiama questa fn per spostare il cursore SUL grafico durante il volo,
    // senza passare da props/stato React
}
```

Dentro: un `ChartContainer` shadcn con `AreaChart` (Recharts), asse X = `cumulativeDistancesKm`,
asse Y = `heights`. Sopra il grafico, un `<div>` posizionato assolutamente col ref esposto
tramite `registerCursorUpdater`: la sua posizione orizzontale si calcola con una mappatura
lineare distanza→pixel calcolata una volta dalla larghezza del contenitore (stesso pattern
già usato in `route-flyover.tsx` per dimensionare il contenitore Cesium), non dalle scale
interne di Recharts. Gli eventi `pointerdown`/`pointermove`/`pointerup` sul contenitore
guidano `onScrubStart`/`onScrubMove`/`onScrubEnd`, throttled a un aggiornamento per frame
con `requestAnimationFrame`.

### `components/route-flyover.tsx`

Nuovo stato React (solo questo, nessun altro, mai per-frame):
```ts
const [chartOpen, setChartOpen] = useState(false)
```

Nuovi ref:
```ts
const cursorEntityRef = useRef<CesiumType>(null)      // rinominato/riusato da entityRef
const chartCursorUpdaterRef = useRef<((index: number) => void) | null>(null)
const infoLabelRef = useRef<HTMLSpanElement>(null)     // "quota · distanza" vicino al bottone
```

Nuove funzioni:

```ts
// Crea l'entità cursore se non esiste ancora — chiamata sia da startFlyover()
// sia dal primo scrub manuale, idempotente.
function ensureCursorEntity(): CesiumType

// Percorso condiviso da volo automatico e trascinamento manuale: sposta
// l'entità Cesium, il cursore CSS sul grafico (se il pannello è aperto) e
// l'etichetta quota/distanza — tutto per riferimento diretto, zero setState.
function updateCursor(index: number) {
  const entity = ensureCursorEntity()
  // ... posiziona l'entità a heights[index] + MARKER_OFFSET_M
  chartCursorUpdaterRef.current?.(index)
  if (infoLabelRef.current) {
    infoLabelRef.current.textContent = `${Math.round(heights[index])} m · ${cumulativeDistancesKm[index].toFixed(1)} km`
  }
}
```

`startFlyover()`'s existing `postUpdate` handler guadagna una chiamata a `updateCursor(i)`
ad ogni frame (l'indice si ricava dalla stessa `time` già disponibile lì). `stopFlyover()`
non cambia.

L'entità cursore resta nascosta (`show: false`) finché non arriva il primo `updateCursor`
— né all'apertura del pannello né al caricamento della pagina compare un punto
sull'indice 0 senza che nessuno l'abbia chiesto. Visibile durante il volo
indipendentemente dal pannello (comportamento di oggi, invariato); visibile durante un
trascinamento solo se il pannello è aperto, per costruzione.

Il grafico (`RouteElevationChart`), montato solo quando `chartOpen` è `true` tramite
`next/dynamic({ ssr: false })`, riceve:
- `onScrubStart`: se `flying`, chiama `stopFlyover()` prima di procedere (il trascinamento
  prende il controllo, stesso comportamento del bottone Stop)
- `onScrubMove`: chiama `updateCursor(index)`
- `onScrubEnd`: nessuna azione particolare — il cursore resta dov'è

### Barra controlli (sotto la mappa)

```
[ Play/Pausa flyover ]     [ Profilo altimetrico ▾ ]
```

Il secondo bottone apre/chiude il pannello (shadcn `Collapsible`). Quando aperto, sotto
compare il grafico con l'etichetta quota/distanza sopra o accanto ad esso.

### Nuove chiavi i18n (namespace `routes`, IT/EN/DE)

```
elevation_chart_toggle    "Profilo altimetrico" / "Elevation profile" / "Höhenprofil"
elevation_chart_altitude  "quota" / "altitude" / "Höhe"
elevation_chart_distance  "distanza" / "distance" / "Distanz"
```

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| Sincronizzare a 60fps tramite React rallenta la pagina | Deciso esplicitamente di non farlo: tutta la sincronizzazione passa da riferimenti diretti (entità Cesium, `textContent`, stile CSS), mai da `setState` per-frame — vedi decisione sopra |
| Il bundle Recharts appesantisce il caricamento iniziale | Montato con `next/dynamic({ssr:false})` solo quando il pannello si apre, stesso pattern già in produzione per Cesium |
| Due marker indipendenti (volo e trascinamento) finiscono per divergere visivamente | Un'unica entità condivisa (`ensureCursorEntity`), non due — nessuna divergenza possibile per costruzione |
| Il grafico e la mappa mostrano quote leggermente diverse nei punti dove il DEM si scosta dal GPS | Entrambi leggono dalla stessa fonte, `heightsRef.current` — nessun secondo calcolo di quota per il grafico |
| Trascinare sul grafico durante il volo produce un comportamento ambiguo (chi controlla la camera?) | Il trascinamento ferma sempre il volo per primo (`stopFlyover()`), poi procede — stesso principio di "Stop" già esistente, nessun nuovo stato ambiguo da gestire |
