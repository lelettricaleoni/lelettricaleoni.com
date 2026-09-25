---
name: media-storage
description: "Use when working with photos, videos, HLS streaming, GPX files, or Cloudflare R2 in this project. Triggers: uploading or deleting media, resolving a video's playback URL, reading or writing a GPX file, touching presigned URLs, or debugging why a video shows as not-ready or a manifest can't be found."
---

# Media e storage in questo progetto

Foto, GPX e video (sorgenti e flussi HLS) vivono tutti su **Cloudflare R2**, un bucket per
ambiente. **MinIO non esiste più** — tutto è migrato il 2026-09-10; se lo trovi citato in un
documento vecchio, è storia, non stato attuale.

## Due moduli, due responsabilità

- **`lib/r2.ts` / `lib/media.ts`** — lato server, credenziali incluse. `resolveHlsUrl` (in
  `media.ts`) è l'unico modo corretto per sapere se un video è pronto: controlla su R2 quale
  manifesto esiste davvero, invece di assumerlo dal nome del file.
- **`lib/media-client.ts`** — solo trasformazioni di stringhe sull'URL pubblico, senza SDK né
  credenziali: importabile da componenti client. Non spostare logica che tocca R2 qui dentro,
  o finisce nel bundle del browser.

## Prefissi del bucket — non è vera privacy

Sorgenti video in `private/route-videos/`, flussi HLS in `public/route-videos/`. Quel
`private/` **non protegge nulla**: il dominio pubblico del bucket espone tutto. Il sorgente
vive solo per i minuti che il worker impiega a cancellarlo dopo la transcodifica — non
trattarlo come se fosse davvero riservato.

## Foto — staging privato, master pubblico

Una foto caricata dal pannello va (URL presigned, PUT diretto dal browser) in
`private/route-photos/…` o `private/bike-model-photos/…`; il worker la trasforma in un
master AVIF (2400 px) sotto `public/…` con estensione `.avif`, e cancella il sorgente.
Mappatura in `photoPublicKey` (`lib/media-client.ts`), **specchio di `imaging.py` nel repo
del worker**: si cambia in due posti o in nessuno. Una foto pubblicata prima di questo lavoro
ha una chiave *senza* `private/` e si serve com'è — è così che le due famiglie si
distinguono, senza migrazione.

- **Mai `r2PublicUrl(m.storageKey)` per una foto**: usare `photoUrl` (client) o
  `resolvePhotoUrl` / `resolveReadyMedia` (server). Una foto senza master non compare, come un
  video senza manifesto.
- **Cancellare = `deleteMediaFiles`**, non `deleteR2Object(storageKey)`: per una foto in
  staging quest'ultimo lascerebbe il master (e il JPEG per le anteprime social) su R2 per
  sempre.
- Le anteprime social (`og:image`, JSON-LD) usano `photoShareUrl`, il piccolo JPEG che il
  worker scrive accanto al master: WhatsApp e Facebook non leggono AVIF.
- **Card, cornici e miniature: `next/image` con `loader={photoLoader}`** (`lib/photo-loader.ts`)
  e come `src` il master (`photoUrl`). Il loader sceglie fra le tre versioni AVIF che il
  worker scrive accanto al master (`<uuid>.w480.avif`, `.w960`, `.w1600`, sempre tutte e tre)
  e serve il master oltre i 1600 px. **Non passare un master AVIF dall'ottimizzatore di
  Vercel**: non ridimensiona l'AVIF, restituisce l'originale da 2400 px (310 KiB) a qualunque
  larghezza, e il browser lo riduce di sette volte in un colpo (raggi seghettati). I nomi e le
  larghezze sono un accordo col worker (`imaging.RENDITION_WIDTHS`): si cambiano in due repo o
  in nessuno. Le foto di prima del worker (JPEG, PNG, WebP) il loader le manda ancora
  all'ottimizzatore di Next. Il viewer a schermo intero usa il master.
- La cancellazione (`deleteMediaFiles`) porta via anche le tre versioni.
- Lo stato passa da `videojob:v1:<storage-key>` con le fasi dei video (`transcoding`
  incluso): il token del worker scrive solo lì, e una fase sconosciuta viene scartata da
  `parseStatus`.
- `/api/upload` è solo per il GPX. I duplicati di foto si controllano nel browser
  (`lib/hash-client.ts`).

## Manifesti HLS — due nomi possibili

Il worker di transcodifica (`lelettricaleoni/videoStream-bucketWorker`, repo separato) ha
cambiato formato in corsa: prima un solo `playlist.m3u8` nella radice del prefisso, dal
commit `55cc594` (2026-06-10) adaptive bitrate con `master.m3u8` più
`1080p|720p|480p/playlist.m3u8` sotto. **Controlla entrambi i nomi** (`HLS_MANIFESTS` in
`media-client.ts`) — un video vecchio ha solo il flat playlist, e ignorarlo lo farebbe
apparire "ancora in elaborazione" per sempre, senza errore visibile.

Le renditions in un `master.m3u8` sono ordinate dalla più alta bitrate alla più bassa
(verificato leggendo un manifesto reale, non assunto) — per un'anteprima silenziosa e in loop,
`lowestBitrateLevel` cerca la bitrate minima, non usa l'indice 0.

## Cache — quando è sicuro tenerla a lungo

`lib/cache.ts` (`readThrough`, su Upstash Redis) tiene per **7 giorni** sia l'URL HLS
risolto sia i punti GPX parsati: entrambi non cambiano più una volta scritti, e il
versionamento della chiave (`hls:v2:...`, `gpx:v1:<key>:<updatedAt>`) fa scadere naturalmente
una voce quando il file sottostante cambia — non serve invalidazione esplicita. **Un valore
`null`/vuoto non viene mai cache-ato**: un fallimento temporaneo (worker non ancora finito,
R2 irraggiungibile) non deve restare "non disponibile" per una settimana. Senza credenziali
Upstash configurate la cache è un no-op che fallisce aperto entro 250ms — sviluppo e CI non
hanno bisogno di Redis per funzionare.

## GPX — watermark e proiezione

Il file GPX originale su R2 resta intatto; `watermarkGpx` (`lib/gpx.ts`) inietta i dati di
Lelettrica al volo, solo al momento del download (`app/api/routes/[id]/gpx`). Per
l'anteprima sulla card, `lib/gpx-svg.ts` proietta i punti `[lon, lat, ele]` in un path SVG —
`gpxPointsToMercatorPath` quando c'è un centro mappa noto (si allinea ai tile di sfondo),
`gpxPointsToSvgPath` altrimenti (schema autonomo, senza mappa).

Per come la traccia GPX si aggancia al terreno 3D (non alla propria quota), vedi la skill
`maps`.
