---
name: maps
description: "Use when working on maps, the Cesium 3D flyover, GPX terrain anchoring, or map tiles in this project. Triggers: touching route-flyover.tsx, lib/terrain.ts, the CARTO tile proxy, or Cesium assets; debugging a track that renders underground or off-position; changing anything under public/cesium/."
---

# Mappe e 3D in questo progetto

## Cesium — self-hosted, non da CDN

`public/cesium/` non è versionato: `scripts/copy-cesium.mjs` lo ricopia da
`node_modules/cesium/Build/Cesium` a ogni `dev` e `build` (silenzioso se la sorgente manca,
non un errore fatale). `Cesium.js` è caricato via tag `<script>`, non tramite `import` —
`next.config.ts` mappa `cesium` su `window.Cesium` apposta per evitare che SWC provi ad
analizzare gli shader GLSL del pacchetto (contengono sequenze di escape ottali che SWC non
digerisce). **Questa mappatura funziona solo con `--webpack`**, non con Turbopack — un'altra
ragione, oltre a quella in `nextjs-16`, per cui questo progetto non lo usa.

Il token Cesium Ion (se impostato) va in `NEXT_PUBLIC_CESIUM_TOKEN`.

## La traccia GPX si ancora al terreno, non alla propria quota

Le quote di un file GPX sono ortometriche (metri sul livello del mare); le posizioni e i
terreni di Cesium sono ellissoidiche (metri sopra l'ellissoide WGS84). Intorno a Trento le due
differiscono di circa **46 m**, il che seppellirebbe la traccia sotto il terreno se usata
direttamente; la risoluzione del DEM e l'errore GPS aggiungono un'altra dispersione di circa
±29 m. La soluzione **non è convertire fra i due riferimenti** (corregerebbe solo lo scarto
sistematico, non la dispersione) — `lib/terrain.ts` scarta la quota del GPX e ricampiona
l'altezza del terreno sotto ogni punto della traccia, ridisegnando lì traccia, marker e
telecamera.

Campionare ogni punto significherebbe migliaia di query al terreno per traccia lunga:
`pickSampleIndices` sceglie un sottoinsieme di punti a spaziatura uniforme (sempre incluso il
primo e l'ultimo), e `interpolateHeights` riempie il resto per interpolazione lineare. Un
campione la cui altezza non è un numero finito (tile di terreno non caricata) viene scartato,
non trattato come zero.

## Tile della mappa 2D — perché passano dal server

`app/api/map-tile/[z]/[x]/[y]` fa da proxy verso CARTO (`basemaps.cartocdn.com`), non il
browser direttamente: `CARTO_API_KEY` resta lato server, mai esposta al client. Cache header
generosa (`s-maxage=604800, immutable`) perché un tile a coordinate fisse non cambia mai.

## Anteprima GPX sulla card (senza Cesium)

Le card nella lista percorsi non caricano Cesium — mostrano un path SVG proiettato in
Web Mercator sopra una griglia di tile statici (vedi la skill `media-storage` per
`gpx-svg.ts`). Il flyover 3D vero e proprio è solo nella pagina di dettaglio
(`components/route-flyover.tsx`, caricato via `route-flyover-loader.tsx` per tenere Cesium
fuori dal bundle iniziale delle pagine che non lo usano).
