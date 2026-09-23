# Elaborazione immagini sul worker — design

> Riguarda il repo `lelettricaleoni/videoStream-bucketWorker` (privato) e questo repo.

## Il problema

Il pannello admin carica le foto (percorsi e modelli bici) dal browser dritte su R2 con
un URL presigned — zero elaborazione lato server, mai esistita. Un file arrivato dal
produttore o da un fotografo, prima di finire online, non passa da nessun controllo di
formato, dimensione o peso.

È emerso caricando la foto di un modello di bici: un TIF ufficiale del produttore da
**120 MB**, sfondo trasparente. Il file funziona — Next/Image lo ridimensiona e
ricodifica a ogni richiesta, come fa con qualunque immagine — ma resta per intero su R2,
e ogni richiesta che manca la cache di Vercel deve prima scaricare e decodificare quei
120 MB prima di poter fare qualunque cosa.

Il dropzone del pannello oggi accetta solo `.jpg/.jpeg/.webp/.png`: un TIF non dovrebbe
nemmeno passare, ma è comunque la prova che le fonti reali (schede prodotto dei
produttori, foto da fotocamere) arrivano spesso in formati o pesi che il sito non è
pensato per ricevere.

## Cosa deve succedere, deciso con Kevin

- **Vale per tutte le foto**, percorsi e bici: stesso meccanismo di upload, stesso
  componente `MediaUpload`, stessa tabella `media` — non ha senso trattarle diverso.
- **Ogni foto caricata passa dal worker**, non solo i formati esotici. Stesso output per
  tutte, stessa garanzia su peso e formato, nessuna eccezione da ricordare.
- **Il worker genera un unico master in AVIF**, ridimensionato a un lato massimo di
  **2400px** (copre anche uno schermo retina alla dimensione più grande mostrata nel
  sito, ~992px in CSS px) e qualità tarata per un buon compromesso visivo.
  AVIF invece di WebP: comprime meglio (in genere un altro 20-50% in meno a parità di
  qualità), è un formato di ingresso supportato da Next/Image esattamente come WebP, e
  l'unico motivo per preferire WebP — un encoding più veloce — non conta qui: **Kevin ha
  confermato che il carico sulla VM non è un problema**, l'elaborazione di un'immagine è
  un evento raro, non c'è nulla che gareggi per la CPU nello stesso momento.
- **Il sorgente caricato viene cancellato dopo l'elaborazione**, stessa filosofia già in
  uso per i video: "la coda è ricostruibile, non durevole", nessun file enorme resta sul
  bucket più del tempo necessario a lavorarlo.
- **Formati accettati in ingresso ampliati**: oltre a `.jpg/.jpeg/.webp/.png`, anche
  `.tif/.tiff` e `.heic/.heif` — il caso concreto che ha fatto emergere il problema, più
  il formato nativo delle fotocamere iPhone, a costo marginale visto che comunque serve
  una libreria di decodifica generica.

## Architettura d'arrivo

Rispecchia esattamente la pipeline video già in produzione (vedi
`2026-09-09-video-worker-queue-design.md`), stesso principio: **la verità sta nello
storage**, la coda si ricostruisce da sola elencando R2.

**Upload va in staging privato.** Le server action che oggi restituiscono un URL
presigned puntato dritto al prefisso pubblico (`route-photos/...`,
`bike-model-photos/...`) puntano invece a un prefisso privato
(`private/route-photos/...`, `private/bike-model-photos/...`), come già fa
`getBikeModelVideoPresignedUploadUrlAction` per i video. Il DB continua a salvare
questa chiave *privata* in `media.storageKey` — non cambia nulla nello schema.

**Il worker trova il lavoro elencando R2**: un sorgente privato senza il corrispondente
oggetto pubblico è il lavoro da fare, esattamente come un video senza manifesto. Nuovo
modulo registrato in `jobs/__init__.py` (`HANDLERS`), stesso pattern di ogni altro
lavoro del worker — un modulo, una riga.

**Elaborazione**: decodifica il sorgente (qualunque formato accettato), ridimensiona al
lato massimo, ricodifica in AVIF, carica il risultato nel prefisso pubblico che il sito
già si aspetta, cancella il sorgente privato. Da verificare in fase di implementazione
se `ffmpeg` — già nell'immagine Docker del worker per i video — ha il supporto AVIF/HEIC
compilato, nel qual caso non serve nessuna dipendenza nuova; altrimenti una libreria di
immagini dedicata (Pillow con plugin AVIF, o `pyvips`/libvips).

**SHA-256 catturato prima di cancellare**, stesso contratto già in uso per i video
(`sha256` dentro lo stato del job, scritto una volta insieme a `phase: 'done'`) — si
integra con il sistema di deduplicazione upload esistente senza bisogno di ricalcolare
nulla lato sito.

**Stato via Upstash, stesso contratto dei video**: il worker scrive direttamente
`imagejob:v1:<storage-key>` sotto lo stesso token ACL `SET`-only già in uso, nessun
canale nuovo da aprire. Fasi calcate su `VIDEO_JOB_PHASES`:
`queued → downloading → processing → uploading → done | failed`. Nuovo
`lib/image-jobs.ts`, copia quasi identica di `lib/video-jobs.ts` (stesso parsing
fail-open, stesso TTL).

**Lettura pubblica invariata nel meccanismo, nuova nel dettaglio**: `resolveHlsUrl`
deriva l'URL pubblico da quello privato e ne cachea l'esistenza; un nuovo
`resolveImageUrl` (in `lib/media.ts`) fa lo stesso per le foto — deriva la chiave
pubblica dalla chiave privata salvata in DB, verifica che l'oggetto esista su R2 (con
cache Redis, stesso `readThrough` già in uso), torna `null` se non è ancora pronto. Ogni
punto che oggi costruisce l'URL di una foto direttamente da `r2PublicUrl(storageKey)` —
`CardMedia`, `MediaThumb`, le gallerie di percorsi e bici — passa invece da questo
resolver. È il cambiamento con la superficie più ampia: tocca ogni posto che mostra una
foto, anche se il meccanismo non è nuovo.

**Il pannello admin mostra "in elaborazione" anche per le foto**, oggi sempre
istantanee. Riusa l'astrazione già scritta in `lib/media-progress.ts` (fasi upload /
elaborazione) e il badge già esistente in `media-upload.tsx` per i video — stessa UI,
un tipo di media in più a cui si applica.

**Le pagine pubbliche trattano una foto non ancora pronta come oggi trattano un video non
ancora pronto**: non compare, senza errore visibile. Una card che aveva solo quella foto
si comporta come una card senza media — non è una condizione nuova da progettare, è
quella che già esiste.

## Cosa NON cambia

- Nessuna migrazione di schema: `media.storageKey` continua a essere una singola chiave,
  cambia solo cosa quella chiave rappresenta concettualmente (privata invece che
  pubblica) — esattamente come già succede per i video.
- Nessun cambiamento all'ottimizzazione di Next/Image: continua a ridimensionare e
  negoziare il formato per il browser a ogni richiesta, invariata. Il master AVIF è solo
  l'input di quella pipeline, non la sostituisce.
- Le foto già pubblicate restano dove sono (sul prefisso pubblico, mai passate dal
  worker): questo lavoro riguarda solo i caricamenti da qui in avanti, stessa scelta già
  fatta per lo SHA-256 sui video già trascodificati.

## Alternative scartate

- **Conversione sincrona in una Server Action (Node/Sharp), niente worker** — più
  semplice (nessun nuovo tipo di job, nessuno stato "in elaborazione", nessun
  cambiamento alle pagine pubbliche), ma un TIF da 120 MB dentro una funzione Vercel è
  esattamente il tipo di carico pesante che i video evitano già di mettergli addosso:
  stessi limiti di memoria e tempo di esecuzione. Contraddice anche la richiesta
  esplicita di Kevin che sia il worker a occuparsene.
- **WebP come formato del master** — comprime meno di AVIF a parità di qualità. Scartato
  quando è emerso che il vincolo che lo giustificava (encoding lento, carico sulla VM)
  non si applica: l'elaborazione immagini è rara, niente compete per la CPU nello stesso
  momento.
- **Conservare il sorgente originale come master d'archivio** — coerente con "non si
  perde mai la sorgente ad alta qualità", ma è esattamente lo spazio che questo lavoro
  vuole recuperare, e per un'immagine (a differenza di un video) non c'è un caso d'uso
  concreto per rigenerare con parametri diversi in futuro.
