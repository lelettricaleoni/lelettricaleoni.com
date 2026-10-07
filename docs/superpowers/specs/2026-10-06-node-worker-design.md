# Il worker in Node.js dentro questo repository — disegno

> Fetta A di due. La fetta B (funzioni nuove del pannello) ha una spec a parte e si costruisce sopra questa.
> Stato: disegno approvato da Kevin il 2026-10-06, in attesa della lettura della spec scritta.

## Perché

Il worker che trascodifica i video e prepara le foto vive in un altro repository (`lelettricaleoni/videoStream-bucketWorker`,
privato, in Python) e parla col sito attraverso un **contratto tenuto allineato a mano**: lo schema delle chiavi di stato
su Upstash, i nomi delle fasi, la mappa sorgente→risultato delle foto, il prefisso dei flussi HLS, le larghezze delle
versioni. Ogni modifica va fatta due volte, in due linguaggi, e un errore si vede solo come «un lavoro che nessuno ha
toccato».

Dal 2026-10-06 sito e worker girano sulla stessa macchina. Il worker passa in questo repository, riscritto in Node e
TypeScript, così che condivida con il sito codice, tipi e un solo Redis (quello della VM) al posto di Upstash.

## Cosa non cambia

- **I file prodotti, per il sito**: stesse chiavi su R2, stesse versioni AVIF (`.w480/.w960/.w1600`), stesso JPEG per le
  anteprime social, stessi manifesti HLS. Il sito non deve accorgersi del cambio.
- **La scala HLS** (1080/720/480/360p, bitrate, segmenti da 4 s allineati con fotogrammi chiave sul tempo): è una scelta
  misurata (VMAF, `docs/ai/STATE.md`), non si tocca. Cambia chi lancia ffmpeg, non cosa gli si chiede.
- **La qualità AVIF 65**: Kevin la trova buona a occhio e ha chiesto di non cambiarla (2026-09-25). Il nuovo codificatore
  non è identico a Pillow: si misura che il risultato sia equivalente, non si ritocca il numero per far tornare i conti.
- **La verità sta nello storage, la coda è ricostruibile.** Un sorgente senza risultato accanto *è* il lavoro da fare. Il
  worker non tiene nulla di durevole: la macchina si può rifare senza perdere niente.
- **Il sorgente si cancella dopo l'elaborazione**, come oggi, ma solo dopo che tutti i risultati sono su R2.

## Cosa è stato valutato e scartato (2026-10-06)

- **Tenere gli originali** (un silo sulla VM, un bucket R2 privato, un MinIO). Kevin ci ha pensato e ha lasciato perdere del
  tutto: nessun originale viene conservato. Non riproporlo. Di conseguenza «rielabora un file» vale solo per le foto, dal
  master AVIF, e i video non si possono rielaborare senza ricaricarli.
- **Il worker dentro il processo del sito** (`instrumentation` di Next): ffmpeg a due CPU affamerebbe il sito e ogni
  deploy ucciderebbe un lavoro di venti minuti.
- **Tenere Python e spostarlo soltanto:** non risolve la duplicazione del contratto, che è la ragione del lavoro.

## Architettura

```
browser ──PUT presigned──▶ R2 private/…           (come oggi)
   │
   └─ Server Action (fine caricamento) ──enqueue──▶ Redis (BullMQ) ◀── worker (container separato)
                                                         │                 │ scarica da R2, elabora,
sito ◀── getJobStatus() (stato dalla coda) ──────────────┘                 │ carica i risultati su R2 public/…,
                                                                           └ cancella il sorgente
scansione ogni 10 min: un sorgente senza risultato viene accodato (rete di sicurezza)
```

**Repository**
- `worker/`: il processo (`main.ts`) e un modulo per lavoro (`jobs/transcode.ts`, `jobs/photo.ts`, `jobs/renditions.ts`).
- `lib/queues/` e `lib/media/`: **codice condiviso**, importato sia dal sito sia dal worker. Nomi delle code, schemi `zod`
  del payload, opzioni dei lavori, mappa delle chiavi (oggi duplicata in `lib/media-client.ts` e `imaging.py`),
  `enqueueMediaJob()` e `getJobStatus()`.
- `Dockerfile.worker`: immagine propria (Node, ffmpeg, `sharp`), impacchettata con `esbuild`. Un container `worker`
  separato dal sito: un deploy del sito non interrompe una transcodifica.

**Redis**: un'istanza sulla VM, persistenza AOF, `maxmemory-policy noeviction` (le code non devono mai essere sfrattate;
la cache ha già i TTL), nessuna porta pubblicata, in una rete interna che sito e worker condividono. Utenti con permessi
limitati: uno per il sito, uno per il worker. Le chiavi di cache portano il nome dell'ambiente (`cache:<env>:…`).

**Stato dei lavori**: si legge dalla coda BullMQ, non da chiavi duplicate. Il lavoro riferisce `{ phase, percent }` con
`job.updateProgress`; `getJobStatus(storageKey)` restituisce la **stessa forma di oggi** (`VideoJobStatus`: fasi
`queued | downloading | transcoding | uploading | done | failed`, percentuale, tentativo, errore, `sha256`), così i componenti
del pannello non cambiano. Il battito del worker sparisce: `queue.getWorkers()` dice se c'è un worker collegato, e carico e
memoria li legge il sito stesso (la macchina è la stessa).

## Il worker

**Code**: i tre nomi di oggi (`video-transcode`, `image-process`, `image-renditions`), un lavoro alla volta per coda (due
core, ffmpeg li usa entrambi), tre tentativi con attesa crescente (10 s), identificativo del lavoro = `bucket/chiave`
(nessun doppione). I lavori completati restano un'ora, i falliti cinquecento, perché il pannello li possa mostrare.

**Avvio dei lavori**: il sito accoda **subito**, quando il caricamento finisce (una Server Action chiama
`enqueueMediaJob`). Oggi un file aspetta fino a 30 s la scansione di R2, che fa circa un milione di operazioni di elenco al
mese, cioè il limite gratuito. La scansione resta come rete di sicurezza ogni 10 minuti e all'avvio.

**Video**: `child_process.spawn` di ffmpeg con gli stessi argomenti di oggi; avanzamento letto da `-progress pipe:1`, un
aggiornamento ogni cinque punti. SHA-256 calcolato in streaming sul sorgente prima di cancellarlo. Caricamento con
`@aws-sdk/lib-storage` e parallelismo sui segmenti; **i manifesti per ultimi**, perché il sito non dichiari pronto un video
a cui mancano i segmenti.

**Foto**: `sharp`. Un solo decode, poi master (lato lungo 2400, mai ingrandito), JPEG 1200 per le anteprime social e le tre
versioni, tutti dalla stessa immagine in memoria. Si mantengono rotazione EXIF, profilo colore, conversione CMYK, TIFF a 16 bit
(non va troncato a 8) e il limite di 300 milioni di pixel. Ordine di caricamento: anteprima, versioni dalla più grande alla più
piccola, **il master per ultimo**, perché la sua presenza significa «foto finita».
- **HEIC (iPhone) è il rischio principale**: `sharp` precompilato non decodifica l'HEVC. Il primo compito del piano è uno
  spike che sceglie fra `libheif-js` (decodifica in RGBA grezzo e poi `sharp`) e `sharp` costruito con `libvips` di sistema.
  Se nessuna delle due regge, si rinuncia all'HEIC *dichiarandolo*: un caricamento HEIC fallirebbe con un errore chiaro.
- **Equivalenza di qualità**: le foto vere del bucket di sviluppo, elaborate dai due codificatori, si confrontano per
  dimensione, similitudine (SSIM) e peso. Soglie fissate nel piano prima di guardare i risultati.

**Priorità e arresto**: il container ha `cpu-shares` più basso del sito e ffmpeg parte con `nice`, così una transcodifica non
rallenta le pagine. Con SIGTERM il worker smette di prendere lavori e aspetta quello in corso (`stop_grace_period` lungo nel
deploy). Se viene ucciso comunque, il sorgente è ancora su R2 e BullMQ ritenta: non si perde niente.

**Log**: JSON strutturato su stdout (`pino`), leggibile con `docker logs`.

## Il passaggio da Python a Node

Le code di Python e di Node parlano lo stesso protocollo BullMQ, quindi si passa **per ambiente, mai con due worker sullo stesso
bucket**.

1. **Senza toccare nulla di vivo**: spike HEIC e confronti (stesso video, stesso `master.m3u8` del worker Python; foto vere).
2. **Redis nuovo accanto al vecchio.** Il Redis del worker Python resta dov'è: i dati delle code sono usa e getta, nessuna
   migrazione.
3. **`staging`**: il worker Node serve solo il bucket di sviluppo; il Python viene riavviato con il solo bucket di produzione.
   Si provano caricamenti veri di foto, video e un HEIC.
4. **Produzione**, quando nessun caricamento è in corso: rilascio del sito con lo stato letto da BullMQ, il worker Node prende
   anche il bucket di produzione, il Python si ferma. Un file in volo non si perde: il sorgente resta su R2 finché un worker non
   finisce.
5. **Dopo**: container Python spento ma pronto, repository `videoStream-bucketWorker` **archiviato, non cancellato**, Upstash
   cancellato dopo la pulizia di Vercel (il ripiego su Vercel lo usa ancora).

**Ritorno indietro**: rimettere il container Python e togliere il bucket dall'ambiente del Node. Nessun dato è in gioco.

## Cosa cambia nel sito

- `lib/redis.ts`: un solo client `ioredis`, a richiesta e che fallisce aperto, al posto di `@upstash/redis` in `lib/cache.ts` e
  `lib/dev-stats.ts`. L'interfaccia `CacheStore`, il limite di 250 ms e il comportamento «senza URL non fa nulla» restano, così
  i test esistenti non cambiano.
- `lib/video-jobs.ts` e `lib/worker-heartbeat.ts` si riscrivono sopra `getJobStatus()` e `queue.getWorkers()`; `/manage/dev`
  mostra conteggi della coda e presenza del worker.
- Variabili: `REDIS_URL` al posto di `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
- Dipendenze: `bullmq`, `ioredis`, `sharp`, `@aws-sdk/lib-storage`, `pino`; in sviluppo `esbuild`.
- CI: il deploy del worker parte solo se cambiano `worker/`, `lib/queues/`, `lib/media/` o i file del Dockerfile; usa lo schema di
  `deploy/web/deploy.sh` (nuovo container accanto al vecchio, ritorno indietro se non è sano).

## Prove

- **Unitarie** (Vitest): mappa delle chiavi (le stesse coppie che oggi fissano le due suite, una per repository), schemi dei
  lavori, traduzione da stato BullMQ a `VideoJobStatus`.
- **Integrazione, con un Redis vero in CI**: da `enqueueMediaJob` al risultato, su un clip di 2 secondi e una foto piccola in
  `worker/fixtures`, con R2 sostituito da una cartella locale dietro la stessa interfaccia.
- **Confronto con Python** prima del passaggio: manifesti e fotografie vere, come sopra.
- **Dal vivo su `staging`**: caricamenti veri dal pannello, controllando il contenuto dei risultati e non il codice HTTP.

## Rischi

| Rischio | Cosa lo tiene a bada |
|---|---|
| HEIC non decodificabile | Spike come primo compito; altrimenti rinuncia dichiarata con errore chiaro |
| AVIF di `sharp` diverso da quello di Pillow | Confronto su foto vere con soglie decise prima; la qualità non si ritocca |
| Memoria di `sharp` su immagini enormi | Limite sui pixel come oggi, lettura sequenziale, un lavoro alla volta |
| Due worker sullo stesso bucket durante il passaggio | Il passaggio è per ambiente; il Python viene riavviato senza il bucket prima che il Node lo prenda |
| Una transcodifica rallenta il sito | `cpu-shares` e `nice`; già misurato che ffmpeg a pieno regime non cambia i tempi del sito (STATE.md) |
| Il sito non vede lo stato durante il passaggio in produzione | Si fa con nessun caricamento in corso; il sorgente su R2 garantisce che nulla si perda |

## Fuori da questa fetta

La **fetta B**, con la sua spec: pagina dell'elenco dei lavori con avanzamento, riprova di un lavoro fallito (possibile perché il
sorgente resta su R2 fino al successo), pausa e ripresa delle code, e rielabora delle sole foto dal master. Costruisce su
`getJobStatus()` e sulle code di questa fetta.

## Raffinamenti emersi scrivendo il piano

Leggendo il codice per scrivere il piano (`docs/superpowers/plans/2026-10-06-node-worker.md`) sono emerse tre cose che la
spec dava per scontate o non vedeva:

1. **Non esiste un «fine caricamento» lato server.** Il browser carica *direttamente su R2* con un URL presigned e la riga
   `media` si scrive solo quando si salva il modulo del percorso. L'accodamento immediato passa quindi da una Server Action,
   `confirmMediaUpload(storageKey)`, che il browser chiama dopo il `PUT` riuscito (`components/admin/media-upload.tsx`).
   Non fallisce mai il caricamento: con la coda spenta, la scansione trova il file entro dieci minuti.
2. **Le code hanno un prefisso per ambiente** (`bullmq-staging`, `bullmq-production`). Un Redis solo serve entrambi gli
   ambienti e un worker non deve prendere i lavori dell'altro, che non hanno il suo bucket. Ne segue un worker (container)
   per ambiente, come per il sito: durante il passaggio, quello di `staging` serve solo il bucket di sviluppo.
3. **Un video senza audio** fa rifiutare a `ffmpeg` la mappa dei flussi che nomina `a:0`: il worker Python nominava sempre
   la traccia audio, quindi quel caso non era coperto. Il worker Node controlla se la sorgente ha un'audio e, se non ce l'ha,
   non la nomina; gli argomenti con audio restano identici a quelli di Python (provato con un file «golden»).
