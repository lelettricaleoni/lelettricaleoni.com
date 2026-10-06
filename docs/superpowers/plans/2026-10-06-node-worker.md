# Il worker in Node.js dentro questo repository — piano di implementazione (fetta A)

> **Per chi esegue (agente):** SOTTO-SKILL OBBLIGATORIA: usare `superpowers:subagent-driven-development` (consigliata) oppure `superpowers:executing-plans` per eseguire il piano compito per compito. I passi usano la sintassi a caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** portare il worker che trascodifica i video e prepara le foto da Python (repository privato) a Node.js/TypeScript in questo repository, con un solo Redis (quello della VM) al posto di Upstash, lo stato dei lavori letto dalla coda BullMQ e un passaggio per ambiente che tiene Python pronto per il ritorno indietro.

**Architettura:** un processo `worker/` con immagine propria (Node, ffmpeg, `sharp`), che condivide con il sito il codice in `lib/media/` e `lib/queues/`. Il sito accoda il lavoro appena il browser conferma un caricamento; il worker scarica da R2, elabora, carica i risultati (master o manifesto per ultimo) e cancella il sorgente. Una scansione ogni 10 minuti ricostruisce i lavori mancanti dallo storage. Code BullMQ con prefisso per ambiente (`bullmq-staging`, `bullmq-production`).

**Stack:** Node 24, TypeScript, BullMQ 5, ioredis 5, `sharp` (già nel progetto), `libheif-js` (HEIC), `@aws-sdk/lib-storage`, `p-limit`, `pino`, `zod` 4, `esbuild`, Vitest 5, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-node-worker-design.md`. Leggere la spec insieme al piano.

## Vincoli globali

(Valgono implicitamente per ogni compito. I valori sono copiati dalla spec e dal codice Python da portare.)

- **Stessi file per il sito**: stesse chiavi su R2, versioni AVIF `.w480.avif`, `.w960.avif`, `.w1600.avif`, JPEG per le anteprime `.share.jpg` (lato lungo 1200, qualità 82), manifesti HLS `master.m3u8` + `<rung>/playlist.m3u8` + `<rung>/segNNN.ts`.
- **Scala HLS invariata** (etichetta, larghezza×altezza, bitrate video, maxrate, bitrate audio): `1080p 1920×1080 3500k 3850k 128k`, `720p 1280×720 1800k 1980k 128k`, `480p 854×480 1000k 1100k 96k`, `360p 640×360 550k 605k 64k`. Segmenti da 4 s, `scenecut=0`, `preset medium`, `bufsize` = 2 × maxrate, fotogrammi chiave sul tempo (`expr:gte(t,n_forced*4)`), `-map 0:a?`.
- **Qualità AVIF 65, non si ritocca** (Kevin, 2026-09-25). Master con lato lungo 2400 mai ingrandito, limite di 300 milioni di pixel. `IMAGE_EFFORT` 3 corrisponde alla `speed` 6 di Pillow (effort = 9 − speed).
- **Il sorgente si cancella solo dopo che TUTTI i risultati sono su R2.** Foto: anteprima, versioni dalla più grande alla più piccola, **master per ultimo**. Video: segmenti, poi le playlist dei livelli, **`master.m3u8` per ultimo**.
- **Code**: `video-transcode`, `image-process`, `image-renditions`; un lavoro alla volta per coda; 3 tentativi, attesa esponenziale da 10 s; identificativo del lavoro `bucket/chiave`; completati conservati 1 ora, falliti 500; prefisso `bullmq-<ambiente>`.
- **Scansione**: all'avvio e ogni 10 minuti. La verità sta nello storage: un sorgente senza risultato accanto *è* il lavoro da fare.
- **Redis**: AOF, `maxmemory-policy noeviction`, nessuna porta pubblicata, utenti con permessi limitati.
- **Codice, identificatori e commenti in inglese.** I testi dell'interfaccia del pannello sono in inglese e non nominano l'infrastruttura (niente «Redis», «BullMQ», «R2» in ciò che legge l'utente).
- **Librerie prima del custom**: `zod` per la validazione, `p-limit`, `pino`, `@aws-sdk/lib-storage`. Nessuna regex di validazione scritta a mano dove esiste una libreria.
- **`--webpack`**, mai Turbopack. Cache Components acceso: nulla in `lib/queues/` importa `server-only` né `next/*`, perché lo importa anche il worker.
- **Flusso git**: ramo da `staging`, PR verso `staging`, mai commit diretti su `main` o `staging`; dopo aver aperto una PR **non aspettare i check** (script di unione in background). Ogni commit termina con la riga `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Prima di dichiarare finito: misurare e confrontare con la versione precedente** (Python), sul contenuto, mai sul codice HTTP.

## Punti da guardare in revisione

Ciò che la spec lascia fuori e che più probabilmente morde chi usa il software, con il compito che lo prova:

1. **Foto con orientamento EXIF** (un iPhone in verticale): non deve uscire ruotata di 90°. → Compito 7 (JPEG con orientamento 6) e Compito 1 (HEIC vero, a mano).
2. **PNG con trasparenza**: master con alfa, anteprima JPEG su fondo bianco, mai nera. → Compito 7.
3. **Video senza traccia audio**: i quattro livelli devono comunque generarsi. → Compito 9 (clip muta con ffmpeg vero).
4. **Estensione maiuscola** (`.JPG`, `.MP4`, `.HEIC`) e punti nel nome (`u.2.tiff`): il sorgente va riconosciuto e il risultato va alla chiave giusta. → Compiti 2, 8 e 10.
5. **Lavoro doppio o già eseguito** (scansione e conferma dal browser quasi insieme; sorgente già cancellato perché un altro tentativo ha finito): non deve fallire né rifare tutto. → Compiti 8, 9 e 10.
6. **Redis irraggiungibile quando il browser conferma un caricamento**: il caricamento non deve fallire; la scansione lo recupera. → Compito 5.

## Mappa dei file

**Nuovi**

| File | Responsabilità |
|---|---|
| `lib/media/keys.ts` | Regole sulle chiavi dello storage, condivise da sito e worker (puro, senza ambiente) |
| `lib/queues/names.ts` | Nomi delle code, nomi dei lavori, prefisso per ambiente |
| `lib/queues/schemas.ts` | Schemi `zod` del lavoro e del suo avanzamento, fasi |
| `lib/queues/options.ts` | Opzioni dei lavori, `jobIdFor`, `queueKindForKey` |
| `lib/queues/add-job.ts` | `addMediaJob(queue, kind, bucket, key)`, usato da sito e scansione |
| `lib/queues/queues.ts` | Le code come le vede il sito (a richiesta, `null` senza `REDIS_URL`) |
| `lib/queues/status.ts` | Da stato BullMQ a `VideoJobStatus`, lettura per chiave |
| `lib/queues/enqueue.ts` | `enqueueMediaJob()` per le Server Action (fallisce aperto) |
| `lib/queues/overview.ts` | Panoramica del worker per `/manage/dev` (conteggi, presenza, carico) |
| `lib/queues/counts.ts` | Somma dei conteggi per `/manage/dev` |
| `lib/settle.ts` | `settle()`: un servizio esterno non trattiene mai una richiesta |
| `lib/redis.ts` | Connessioni `ioredis` del sito |
| `worker/config.ts`, `logger.ts`, `hash.ts`, `progress.ts`, `storage.ts` | Fondamenta del worker |
| `worker/testing/dir-store.ts`, `ffmpeg.ts` | Aiuti per i test (non finiscono nel pacchetto) |
| `worker/imaging.ts`, `heic.ts` | Elaborazione delle foto |
| `worker/jobs/types.ts`, `photo.ts`, `renditions.ts`, `video.ts` | I lavori |
| `worker/scan.ts` | Scansione di sicurezza |
| `worker/runtime.ts`, `health.ts`, `selfcheck.ts`, `main.ts` | Avvio, battito di salute, controllo a freddo |
| `scripts/build-worker.mjs` | Impacchetta il worker con `esbuild` |
| `Dockerfile.worker` | Immagine del worker |
| `deploy/redis/*`, `deploy/worker/*`, `deploy/deploy-entry.sh` | Redis sulla VM, deploy del worker, ingresso unico SSH |
| `.github/workflows/deploy-worker.yml` | Deploy del worker |

**Modificati**: `lib/media-client.ts` (rimanda a `lib/media/keys.ts`), `lib/photo-loader.ts`, `lib/cache.ts`, `lib/dev-stats.ts`, `lib/video-jobs.ts`, `lib/actions/media-jobs.ts`, `components/admin/media-upload.tsx`, `app/manage/dev/page.tsx`, `next.config.ts`, `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.dockerignore`, `.gitignore`, `.env.local.example`, `deploy/web/deploy.sh`, `deploy/web/env.template`, `docs/*`.

**Eliminati**: `lib/worker-heartbeat.ts` e il suo test (sostituiti da `lib/queues/overview.ts`).

## Ordine delle PR e delle operazioni

1. **PR 1 — fondamenta e worker** (compiti 1-12): aggiuntiva, il comportamento del sito non cambia. Si unisce per prima.
2. **PR 2 — Redis e deploy** (compito 13): si **apre ma non si unisce** finché la VM non è pronta, perché `deploy-worker.yml`, appena unito, partirebbe e cercherebbe i file della VM.
3. **Confronto con Python** (compito 15): si può fare in qualunque momento prima del punto 5.
4. **PR 3 — il sito passa al nuovo sistema** (compito 14): si apre, non si unisce ancora.
5. **Operazioni sulla VM** (compito 16, parte 1, passi 1-5): Redis acceso, file delle variabili, ingresso unico SSH, Python ristretto al bucket di produzione.
6. **Si uniscono la PR 2 e poi la PR 3** (compito 16, passo 6): parte il deploy del worker su `staging`, poi quello del sito.
7. **Prove dal vivo su `staging`** (compito 16, parte 2).
8. **Produzione** (compito 17), con un rilascio `staging → main`.

---

### Compito 1: Spike sulla decodifica HEIC

Una prova per decidere come leggere le foto dell'iPhone. Non produce codice di prodotto: il risultato è un documento. `sharp` precompilato non decodifica l'HEVC (brevetti), quindi si prova `libheif-js`.

**File:**
- Crea: `worker/scripts/make-heic-fixture.py`, `worker/fixtures/sample.heic` (generato), `worker/scripts/spike-heic.mjs`, `docs/ai/ideas/heic-decode-spike.md`
- Modifica: `package.json` (dipendenza `libheif-js`)

**Interfacce:**
- Produce: la decisione scritta in `docs/ai/ideas/heic-decode-spike.md` («percorso A: `libheif-js`» oppure «percorso B: `sharp` con `libvips` di sistema»), e il file `worker/fixtures/sample.heic` (640×480) che i compiti 7 e 8 usano.

- [ ] **Passo 1: ramo e dipendenze**

```bash
git switch -c feat/node-worker origin/staging
npm install libheif-js
```
Atteso: `libheif-js` compare in `dependencies` di `package.json`.

- [ ] **Passo 2: generare la foto di prova**

Serve Python con `pillow-heif` e `numpy` (`pip install pillow-heif numpy`).

```python
# worker/scripts/make-heic-fixture.py
"""
Writes worker/fixtures/sample.heic (640x480, committed) and, with `--large <path>`, a 12 MP file for timing.

The image is a gradient with a checkerboard and noise, not a flat colour, so that compressing it and comparing the
result means something.
"""
import pathlib
import sys

import numpy as np
import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()


def photo_like(width: int, height: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:height, 0:width]
    red = (255 * x / width).astype(np.uint8)
    green = (255 * y / height).astype(np.uint8)
    board = ((x // 64 + y // 64) % 2 * 160 + 40).astype(np.uint8)
    noise = rng.integers(0, 24, size=(height, width), dtype=np.uint8)
    blue = np.clip(board.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([red, green, blue]), "RGB")


fixtures = pathlib.Path(__file__).resolve().parent.parent / "fixtures"
fixtures.mkdir(exist_ok=True)
photo_like(640, 480, seed=1).save(fixtures / "sample.heic", quality=60)

if "--large" in sys.argv:
    target = pathlib.Path(sys.argv[sys.argv.index("--large") + 1])
    photo_like(4032, 3024, seed=2).save(target, quality=75)
    print("large file written to", target)

print("sample written to", fixtures / "sample.heic")
```

```bash
python worker/scripts/make-heic-fixture.py --large "$TEMP/large.heic"
```
Atteso: `sample written to …/worker/fixtures/sample.heic` e `large file written to …`.

- [ ] **Passo 3: lo script della prova**

```js
// worker/scripts/spike-heic.mjs
// Throwaway: the outcome goes in docs/ai/ideas/heic-decode-spike.md, this file is not part of the product.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const libheif = require('libheif-js')

const file = process.argv[2]
if (!file) throw new Error('usage: node worker/scripts/spike-heic.mjs <file.heic> [out.avif]')

const started = performance.now()
const [image] = new libheif.HeifDecoder().decode(readFileSync(file))
if (!image) throw new Error('the file holds no image')
const width = image.get_width()
const height = image.get_height()
const rgba = new Uint8ClampedArray(width * height * 4)
await new Promise((resolve, reject) => {
  image.display({ data: rgba, width, height }, (result) => (result ? resolve(result) : reject(new Error('libheif could not decode'))))
})
const decoded = performance.now()

const out = await sharp(Buffer.from(rgba.buffer), { raw: { width, height, channels: 4 } })
  .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
  .avif({ quality: 65, effort: 3 })
  .toFile(process.argv[3] ?? 'spike-out.avif')
const encoded = performance.now()

console.log(JSON.stringify({
  file, width, height,
  decodeMs: Math.round(decoded - started),
  encodeMs: Math.round(encoded - decoded),
  rssMb: Math.round(process.memoryUsage().rss / 1048576),
  outputBytes: out.size, outWidth: out.width, outHeight: out.height,
}, null, 2))
```

- [ ] **Passo 4: lanciarla sul piccolo e sul grande**

```bash
node worker/scripts/spike-heic.mjs worker/fixtures/sample.heic "$TEMP/sample.avif"
node worker/scripts/spike-heic.mjs "$TEMP/large.heic" "$TEMP/large.avif"
```
Atteso per il piccolo: `width: 640`, `height: 480`. Se `display` ha una firma diversa da quella usata, correggere lo script qui e annotare la firma vera nel documento.

**Criterio di accettazione del percorso A** (deciso prima di guardare i numeri): sul file da 12 MP, `decodeMs` ≤ 20000 e `rssMb` ≤ 1536.

- [ ] **Passo 5: provarlo con una foto vera dall'iPhone**

Chiedere a Kevin una foto **in verticale** scattata con l'iPhone (HEIC, qualunque, meglio sotto i 5 MB) e metterla fuori dal repository (`temp/portrait.heic`, la cartella è ignorata da git: contiene le coordinate GPS). Lanciare lo script su di lei, poi aprire `spike-out.avif` e guardare: **deve essere in verticale e non specchiata**.

- [ ] **Passo 6: scrivere il risultato**

Creare `docs/ai/ideas/heic-decode-spike.md` con: la tabella dei due file (larghezza, altezza, `decodeMs`, `encodeMs`, `rssMb`, dimensione), l'esito sull'orientamento della foto vera, e una riga **«Decisione: percorso A»** (se il criterio è rispettato e la foto esce dritta) o **«Decisione: percorso B»** (altrimenti).

- [ ] **Passo 7: commit**

```bash
git add package.json package-lock.json worker/scripts worker/fixtures/sample.heic docs/ai/ideas/heic-decode-spike.md
git commit -m "Spike: decode HEIC with libheif-js and measure it"
```

**Se la decisione è il percorso B:** il compito 7 sostituisce `decodeHeic` con la lettura diretta di `sharp` costruito contro `libvips` di sistema; vedere il compito 7, passo 9 («Variante B»).

---

### Compito 2: Regole sulle chiavi condivise (`lib/media/keys.ts`)

Oggi le stesse regole stanno due volte: in `lib/media-client.ts` e `lib/photo-loader.ts` (sito) e in `imaging.py` e `jobs/transcode.py` (worker). Qui diventano un file solo, puro, che sito e worker importano. Le regole sono quelle di Python, con gli stessi esempi dei suoi test.

**File:**
- Crea: `lib/media/keys.ts`, `lib/media/keys.test.ts`
- Modifica: `lib/media-client.ts`, `lib/photo-loader.ts`
- Prova che resta verde: `lib/media-client.test.ts`, `lib/media-client-photos.test.ts`, `lib/photo-loader.test.ts`

**Interfacce:**
- Produce (tutto da `@/lib/media/keys`):
  `RENDITION_WIDTHS: readonly [480, 960, 1600]`,
  `PHOTO_STAGING_PREFIXES`, `PHOTO_PUBLIC_PREFIXES`, `PHOTO_SOURCE_EXTENSIONS`, `type PhotoSourceExtension`,
  `VIDEO_STAGING_PREFIXES`, `VIDEO_SOURCE_EXTENSIONS`, `HLS_MANIFESTS`,
  `extensionOf(key): string`, `isStagedPhotoKey(key): boolean`, `isPhotoSourceKey(key): boolean`, `isVideoSourceKey(key): boolean`,
  `photoPublicKey(storageKey): string`, `photoMasterKeyFor(sourceKey): string` (lancia se non è `private/`),
  `photoShareKey(storageKey): string`, `isMasterKey(key): boolean`, `photoRenditionKey(masterKey, width): string` (lancia se non è un master),
  `photoRenditionKeys(storageKey): string[]`, `deriveHlsPrefix(privateKey): string`.

- [ ] **Passo 1: scrivere il test che fallisce**

```ts
// lib/media/keys.test.ts
import { describe, expect, it } from 'vitest'
import {
  RENDITION_WIDTHS, deriveHlsPrefix, extensionOf, isMasterKey, isPhotoSourceKey, isStagedPhotoKey, isVideoSourceKey,
  photoMasterKeyFor, photoPublicKey, photoRenditionKey, photoRenditionKeys, photoShareKey,
} from './keys'

// The same pairs the Python worker's tests pinned (tests/test_imaging.py and tests/test_transcode_prefixes.py):
// if the site and the worker ever disagree, a file is written where nobody looks.
describe('photo keys', () => {
  it.each([
    ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.avif'],
    ['private/route-photos/r1/u1.HEIC', 'public/route-photos/r1/u1.avif'],
    ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.avif'],
  ])('the master of %s is %s', (source, expected) => {
    expect(photoMasterKeyFor(source)).toBe(expected)
    expect(photoPublicKey(source)).toBe(expected)
  })

  it('refuses to make a master for a key that is not in staging', () => {
    expect(() => photoMasterKeyFor('route-photos/r1/u1.jpg')).toThrow(/not a staging key/)
  })

  it('leaves a key that is already public untouched', () => {
    expect(photoPublicKey('public/route-photos/r1/old.jpg')).toBe('public/route-photos/r1/old.jpg')
  })

  it.each([
    ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.share.jpg'],
    ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.share.jpg'],
  ])('the link preview of %s is %s', (source, expected) => {
    expect(photoShareKey(source)).toBe(expected)
  })

  it.each([
    ['private/route-photos/r1/u1.jpg', 480, 'public/route-photos/r1/u1.w480.avif'],
    ['private/bike-model-photos/m1/u.2.tiff', 960, 'public/bike-model-photos/m1/u.2.w960.avif'],
    ['private/route-photos/r1/u1.png', 1600, 'public/route-photos/r1/u1.w1600.avif'],
  ])('the %s rendition of %s', (source, width, expected) => {
    expect(photoRenditionKey(photoMasterKeyFor(source), width)).toBe(expected)
  })

  it('lists every rendition of a staged photo, and none for one that predates the worker', () => {
    expect(photoRenditionKeys('private/route-photos/r1/u1.jpg')).toEqual([
      'public/route-photos/r1/u1.w480.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w1600.avif',
    ])
    expect(photoRenditionKeys('public/route-photos/r1/old.jpg')).toEqual([])
  })

  it('has the widths the site picks among', () => {
    expect([...RENDITION_WIDTHS]).toEqual([480, 960, 1600])
  })

  it.each([
    'private/route-photos/r1/u1.jpg',
    'private/route-photos/r1/u1.JPEG',
    'private/route-photos/r1/u1.tif',
    'private/bike-model-photos/m1/u1.heif',
    'private/bike-model-photos/m1/u1.webp',
    'private/route-photos/r1/IMG_0001.HEIC',
  ])('accepts %s as a photo source, whatever the case of the extension', (key) => {
    expect(isPhotoSourceKey(key)).toBe(true)
  })

  it.each([
    'private/route-videos/r1/u1.mp4',
    'private/route-photos/r1/u1.gif',
    'private/route-photos/r1/u1.avif',
    'private/route-photos/r1/noextension',
    'public/route-photos/r1/u1.avif',
    'route-photos/r1/u1.jpg',
  ])('does not accept %s as a photo source', (key) => {
    expect(isPhotoSourceKey(key)).toBe(false)
  })

  it('knows a staged photo by its prefix alone', () => {
    expect(isStagedPhotoKey('private/route-photos/r1/anything')).toBe(true)
    expect(isStagedPhotoKey('public/route-photos/r1/u1.avif')).toBe(false)
  })

  it.each([
    'public/route-photos/r1/u1.avif',
    'public/bike-model-photos/m1/u.2.avif',
  ])('%s is a master', (key) => {
    expect(isMasterKey(key)).toBe(true)
  })

  it.each([
    'public/route-photos/r1/u1.w480.avif',
    'public/route-photos/r1/u1.w1600.avif',
    'public/route-photos/r1/u1.share.jpg',
    'public/route-photos/r1/u1.jpg',
    'public/route-videos/r1/u1/master.m3u8',
    'private/route-photos/r1/u1.avif',
    'route-photos/r1/u1.avif',
  ])('%s is not a master', (key) => {
    expect(isMasterKey(key)).toBe(false)
  })

  it('refuses to name a rendition of something that is not a master', () => {
    expect(() => photoRenditionKey('public/route-photos/r1/u1.w480.avif', 960)).toThrow(/not a master/)
  })
})

describe('video keys', () => {
  it.each([
    ['private/route-videos/r1/u1.mp4', 'public/route-videos/r1/u1/'],
    ['private/bike-model-videos/m1/u1.mov', 'public/bike-model-videos/m1/u1/'],
    ['private/bike-model-videos/m1/a.b.c.mp4', 'public/bike-model-videos/m1/a.b.c/'],
    // Only the leading private/ changes, not a folder that happens to be called private further down.
    ['private/bike-model-videos/private/u1.mp4', 'public/bike-model-videos/private/u1/'],
  ])('the stream of %s lives under %s', (source, expected) => {
    expect(deriveHlsPrefix(source)).toBe(expected)
  })

  it.each([
    'private/route-videos/r1/u1.mp4',
    'private/route-videos/r1/U1.MP4',
    'private/bike-model-videos/m1/u1.MOV',
    'private/bike-model-videos/m1/u1.webm',
  ])('accepts %s as a video source', (key) => {
    expect(isVideoSourceKey(key)).toBe(true)
  })

  it.each([
    'private/route-videos/r1/u1.txt',
    'private/route-videos/r1/noextension',
    'private/route-photos/r1/u1.jpg',
    'public/route-videos/r1/u1/master.m3u8',
  ])('does not accept %s as a video source', (key) => {
    expect(isVideoSourceKey(key)).toBe(false)
  })
})

describe('extensionOf', () => {
  it('lower-cases the extension of the last path segment only', () => {
    expect(extensionOf('private/route-photos/r.1/u1.JPG')).toBe('jpg')
    expect(extensionOf('private/route-photos/r.1/u1')).toBe('')
    expect(extensionOf('a/b/c.d.e')).toBe('e')
  })
})
```

- [ ] **Passo 2: vederlo fallire**

Run: `npx vitest run lib/media/keys.test.ts`
Atteso: FAIL, `Failed to resolve import "./keys"`.

- [ ] **Passo 3: scrivere `lib/media/keys.ts`**

```ts
// lib/media/keys.ts
/**
 * Storage key rules shared by the site and the media worker.
 *
 * Pure string functions: no environment, no database, no SDK. The browser, the server and the worker all import this
 * file, which replaces the "contract kept in step by hand" the two repositories used to have (the worker was in
 * Python, and every rule here existed twice).
 *
 * A photo is uploaded to a staging prefix and the worker turns it into an AVIF master under the matching `public/` key.
 * A photo uploaded before the worker handled photos sits directly at its public key: it is recognised by *not* being
 * staged, and served exactly as before.
 */

/** Widths of the responsive renditions cut beside every photo master; lib/photo-loader.ts picks among them. */
export const RENDITION_WIDTHS = [480, 960, 1600] as const

export const PHOTO_STAGING_PREFIXES = ['private/route-photos/', 'private/bike-model-photos/'] as const
export const PHOTO_PUBLIC_PREFIXES = ['public/route-photos/', 'public/bike-model-photos/'] as const

/** Formats the worker can decode; anything else would sit in staging forever. */
export const PHOTO_SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif'] as const
export type PhotoSourceExtension = (typeof PHOTO_SOURCE_EXTENSIONS)[number]

export const VIDEO_STAGING_PREFIXES = ['private/route-videos/', 'private/bike-model-videos/'] as const
export const VIDEO_SOURCE_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] as const

/**
 * Manifest names the worker may have produced, most capable first. Adaptive bitrate is `master.m3u8` in the stream's
 * root; videos transcoded before that still only have the flat `playlist.m3u8`, so both have to be accepted.
 */
export const HLS_MANIFESTS = ['master.m3u8', 'playlist.m3u8'] as const

/** Lower-cased extension of the last path segment, or an empty string. */
export function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function isStagedPhotoKey(key: string): boolean {
  return PHOTO_STAGING_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** A staged photo the worker should turn into a master: the right prefix and a format it can decode. */
export function isPhotoSourceKey(key: string): boolean {
  return isStagedPhotoKey(key) && (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(key))
}

export function isVideoSourceKey(key: string): boolean {
  return (
    VIDEO_STAGING_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    (VIDEO_SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(key))
  )
}

function stemOf(key: string): string {
  const dot = key.lastIndexOf('.')
  return dot > key.lastIndexOf('/') ? key.slice(0, dot) : key
}

/** private/route-photos/{owner}/{uuid}.jpg → public/route-photos/{owner}/{uuid}.avif; any other key is already public. */
export function photoPublicKey(storageKey: string): string {
  if (!isStagedPhotoKey(storageKey)) return storageKey
  return 'public/' + stemOf(storageKey).slice('private/'.length) + '.avif'
}

/** The master a worker writes for a staging key. Throws for anything that is not under `private/`. */
export function photoMasterKeyFor(sourceKey: string): string {
  if (!sourceKey.startsWith('private/')) throw new Error(`not a staging key: ${sourceKey}`)
  return 'public/' + stemOf(sourceKey).slice('private/'.length) + '.avif'
}

/**
 * The small JPEG the worker writes beside a staged photo's master, for link previews only: WhatsApp, Facebook and
 * LinkedIn do not read AVIF. A photo that predates the worker already is a JPEG, PNG or WebP and stands in for itself.
 */
export function photoShareKey(storageKey: string): string {
  const key = photoPublicKey(storageKey)
  return isStagedPhotoKey(storageKey) ? key.replace(/\.avif$/, '.share.jpg') : key
}

const RENDITION_SUFFIX = /\.w\d+\.avif$/

/** A processed photo's master: not a rendition, not a link-preview JPEG, not anything else. */
export function isMasterKey(key: string): boolean {
  return (
    PHOTO_PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    key.endsWith('.avif') &&
    !RENDITION_SUFFIX.test(key)
  )
}

/** public/route-photos/{owner}/{uuid}.avif → public/route-photos/{owner}/{uuid}.w{width}.avif */
export function photoRenditionKey(masterKey: string, width: number): string {
  if (!isMasterKey(masterKey)) throw new Error(`not a master key: ${masterKey}`)
  return masterKey.replace(/\.avif$/, `.w${width}.avif`)
}

/** The renditions of a staged photo, as keys, so that deleting a photo can take them along. Photos from before the worker have none. */
export function photoRenditionKeys(storageKey: string): string[] {
  if (!isStagedPhotoKey(storageKey)) return []
  const master = photoPublicKey(storageKey)
  return RENDITION_WIDTHS.map((width) => photoRenditionKey(master, width))
}

/** private/route-videos/{routeId}/{uuid}.ext → public/route-videos/{routeId}/{uuid}/ */
export function deriveHlsPrefix(privateKey: string): string {
  return privateKey.replace(/^private\//, 'public/').replace(/\.[^.]+$/, '') + '/'
}
```

- [ ] **Passo 4: rimandare i file esistenti a `keys.ts`**

In `lib/media-client.ts` sostituire il file con questo contenuto (le funzioni spostate diventano riesportazioni; quelle che dipendono dall'ambiente o dal database restano):

```ts
import type { Media } from './db'
import {
  HLS_MANIFESTS,
  PHOTO_SOURCE_EXTENSIONS,
  deriveHlsPrefix,
  isStagedPhotoKey,
  photoPublicKey,
  photoShareKey,
  type PhotoSourceExtension,
} from './media/keys'

/**
 * Media URL helpers safe to import from client components.
 *
 * Everything here is a pure string transform over the public bucket URL, so it carries no credentials and no AWS SDK.
 * The key rules themselves (what a photo's master is called, where a video's stream lives) are in `./media/keys`, which
 * the media worker imports too; they are re-exported here so existing imports keep working. The server-side
 * counterparts, the ones that actually talk to R2, live in `./r2`.
 */

export {
  HLS_MANIFESTS,
  PHOTO_SOURCE_EXTENSIONS,
  PHOTO_STAGING_PREFIXES,
  deriveHlsPrefix,
  isStagedPhotoKey,
  photoPublicKey,
  photoRenditionKeys,
  photoShareKey,
  type PhotoSourceExtension,
} from './media/keys'

export const MEDIA_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function mediaPublicUrl(key: string): string {
  return `${MEDIA_PUBLIC_URL}/${key}`
}

/** Public URL of one manifest for a stored video. */
export function hlsUrl(privateKey: string, manifest: string = HLS_MANIFESTS[1]): string {
  return mediaPublicUrl(deriveHlsPrefix(privateKey) + manifest)
}

/** Public URL of a photo as it will be served once ready. Says nothing about whether it is ready. */
export function photoUrl(storageKey: string): string {
  return mediaPublicUrl(photoPublicKey(storageKey))
}

export function photoShareUrl(storageKey: string): string {
  return mediaPublicUrl(photoShareKey(storageKey))
}

const PHOTO_CONTENT_TYPES: Record<PhotoSourceExtension, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** Lower-cased extension of an uploaded file if the worker can decode it, otherwise null. */
export function photoSourceExtension(fileName: string): PhotoSourceExtension | null {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return null
  const ext = fileName.slice(dot + 1).toLowerCase()
  return (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(ext) ? (ext as PhotoSourceExtension) : null
}

/**
 * Derived from the extension, not the browser's `file.type`: Chrome on Windows reports an empty type for a HEIC file,
 * and the type is signed into the upload URL, so both sides have to agree on exactly one value.
 */
export function photoContentType(ext: PhotoSourceExtension): string {
  return PHOTO_CONTENT_TYPES[ext]
}

/**
 * A media row with its HLS manifest already resolved on the server.
 *
 * Which manifest exists depends on when the worker processed the video, and only the server can check. Resolving it
 * once server-side keeps the client from guessing — and from silently showing nothing when it guesses wrong.
 */
export type MediaWithHls = Media & { hlsUrl?: string }

/**
 * Index of the lowest-bitrate rendition in an hls.js `levels` array.
 *
 * Not index 0: the worker's manifest lists renditions highest-bitrate first (confirmed by reading a real master.m3u8,
 * not assumed), so the lowest rung is whichever entry actually has the smallest `bitrate` — picking by position would
 * start these silent, looping previews at 1080p, the opposite of the point.
 */
export function lowestBitrateLevel(levels: { bitrate: number }[]): number {
  return levels.reduce((min, level, i, all) => (level.bitrate < all[min].bitrate ? i : min), 0)
}
```

In `lib/photo-loader.ts` sostituire la riga `export const RENDITION_WIDTHS = [480, 960, 1600] as const` (con il commento `/** Must match RENDITION_WIDTHS in the worker's imaging.py. */` che la precede) con:

```ts
// The widths live in lib/media/keys.ts, where the worker reads the same list.
import { RENDITION_WIDTHS } from './media/keys'
export { RENDITION_WIDTHS }
```

E nel commento in testa al file sostituire la frase «The naming is a contract with the worker (imaging.rendition_key_for in the videoStream-bucketWorker repo)» con «The naming is defined in lib/media/keys.ts, which the media worker imports too».

- [ ] **Passo 5: far passare tutto**

Run: `npx vitest run lib/media lib/media-client.test.ts lib/media-client-photos.test.ts lib/photo-loader.test.ts`
Atteso: PASS, nessun test esistente cambiato.

Run: `npm run typecheck`
Atteso: nessun errore (un errore qui segnala un'importazione che ha perso un'esportazione).

- [ ] **Passo 6: commit**

```bash
git add lib/media lib/media-client.ts lib/photo-loader.ts
git commit -m "Move the storage key rules to lib/media/keys.ts, shared with the worker"
```

---

### Compito 3: Il contratto delle code (`lib/queues/names.ts`, `schemas.ts`, `options.ts`)

**File:**
- Crea: `lib/queues/names.ts`, `lib/queues/schemas.ts`, `lib/queues/options.ts`, `lib/queues/add-job.ts`
- Test: `lib/queues/queues-contract.test.ts`

**Interfacce:**
- Consuma: `@/lib/app-env` (`appEnv()`), `@/lib/media/keys` (`isPhotoSourceKey`, `isVideoSourceKey`).
- Produce:
  `QUEUE_NAMES: { video: 'video-transcode'; photo: 'image-process'; renditions: 'image-renditions' }`, `type QueueKind`, `QUEUE_KINDS: QueueKind[]`, `JOB_NAMES: Record<QueueKind, string>`, `queuePrefix(env?: string): string`;
  `JOB_PHASES`, `MediaJobData` (zod) e `type MediaJobData = { bucket: string; key: string }`, `JobProgress` (zod) e `type JobProgress`;
  `MAX_ATTEMPTS`, `BACKOFF_MS`, `JOB_OPTIONS`, `jobIdFor(bucket, key): string`, `queueKindForKey(key): 'video' | 'photo' | null`;
  `addMediaJob(queue: Pick<Queue, 'add'>, kind: QueueKind, bucket: string, key: string): Promise<void>`.

- [ ] **Passo 1: installare BullMQ**

```bash
npm install bullmq ioredis
```

- [ ] **Passo 2: scrivere il test che fallisce**

```ts
// lib/queues/queues-contract.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Queue } from 'bullmq'
import { JOB_NAMES, QUEUE_KINDS, QUEUE_NAMES, queuePrefix } from './names'
import { JOB_PHASES, JobProgress, MediaJobData } from './schemas'
import { JOB_OPTIONS, MAX_ATTEMPTS, jobIdFor, queueKindForKey } from './options'
import { addMediaJob } from './add-job'

describe('queue names', () => {
  it('are the three the worker has always had', () => {
    expect(QUEUE_NAMES).toEqual({ video: 'video-transcode', photo: 'image-process', renditions: 'image-renditions' })
    expect(QUEUE_KINDS).toEqual(['video', 'photo', 'renditions'])
    expect(JOB_NAMES).toEqual({ video: 'transcode', photo: 'process', renditions: 'render' })
  })

  it('keeps the environments apart with a prefix', () => {
    expect(queuePrefix('production')).toBe('bullmq-production')
    expect(queuePrefix('staging')).toBe('bullmq-staging')
  })
})

describe('MediaJobData', () => {
  it('accepts a bucket and a key', () => {
    expect(MediaJobData.parse({ bucket: 'b', key: 'private/route-photos/r/u.jpg' })).toEqual({
      bucket: 'b', key: 'private/route-photos/r/u.jpg',
    })
  })

  it.each([{}, { bucket: '', key: 'k' }, { bucket: 'b' }, { bucket: 'b', key: 42 }])('rejects %j', (value) => {
    expect(MediaJobData.safeParse(value).success).toBe(false)
  })
})

describe('JobProgress', () => {
  it('has the phases the panel already knows', () => {
    expect([...JOB_PHASES]).toEqual(['queued', 'downloading', 'transcoding', 'uploading', 'done', 'failed'])
  })

  it('accepts what the worker reports and rejects a phase nobody knows', () => {
    expect(JobProgress.safeParse({ phase: 'transcoding', percent: 40, attempt: 1, updatedAt: 5 }).success).toBe(true)
    expect(JobProgress.safeParse({ phase: 'melting', updatedAt: 5 }).success).toBe(false)
    expect(JobProgress.safeParse({ phase: 'done', percent: 140, updatedAt: 5 }).success).toBe(false)
    expect(JobProgress.safeParse({ phase: 'done', sha256: 'nope', updatedAt: 5 }).success).toBe(false)
  })
})

describe('job options', () => {
  it('retry three times with a growing wait, keep finished jobs an hour and failed ones five hundred', () => {
    expect(MAX_ATTEMPTS).toBe(3)
    expect(JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { count: 500 },
    })
  })

  it('identifies a job by the object it is about, so the queue refuses duplicates by itself', () => {
    expect(jobIdFor('lelettrica-trails', 'private/route-videos/r/u.mp4')).toBe('lelettrica-trails/private/route-videos/r/u.mp4')
  })
})

describe('queueKindForKey', () => {
  it.each([
    ['private/route-videos/r/u.mp4', 'video'],
    ['private/bike-model-videos/m/u.MOV', 'video'],
    ['private/route-photos/r/u.jpg', 'photo'],
    ['private/bike-model-photos/m/u.HEIC', 'photo'],
  ])('%s goes to the %s queue', (key, kind) => {
    expect(queueKindForKey(key)).toBe(kind)
  })

  it.each(['public/route-photos/r/u.avif', 'route-gpx/r/track.gpx', 'private/route-videos/r/u.txt'])('%s is not a job', (key) => {
    expect(queueKindForKey(key)).toBeNull()
  })
})

describe('addMediaJob', () => {
  it('adds the job under its object as the id, with the shared options', async () => {
    const add = vi.fn(async () => ({}))
    await addMediaJob({ add } as unknown as Pick<Queue, 'add'>, 'photo', 'b', 'private/route-photos/r/u.jpg')
    expect(add).toHaveBeenCalledWith(
      'process',
      { bucket: 'b', key: 'private/route-photos/r/u.jpg' },
      { ...JOB_OPTIONS, jobId: 'b/private/route-photos/r/u.jpg' },
    )
  })
})
```

- [ ] **Passo 3: vederlo fallire**

Run: `npx vitest run lib/queues/queues-contract.test.ts`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 4: scrivere i quattro file**

```ts
// lib/queues/names.ts
import { appEnv } from '@/lib/app-env'

/** The three queues, under the names the Python worker used, so a queue can be handed over without renaming anything. */
export const QUEUE_NAMES = {
  video: 'video-transcode',
  photo: 'image-process',
  renditions: 'image-renditions',
} as const

export type QueueKind = keyof typeof QUEUE_NAMES
export const QUEUE_KINDS = Object.keys(QUEUE_NAMES) as QueueKind[]

/** The name BullMQ gives a job of each queue; it only shows up in logs and in the queue's own bookkeeping. */
export const JOB_NAMES: Record<QueueKind, string> = {
  video: 'transcode',
  photo: 'process',
  renditions: 'render',
}

/**
 * One Redis serves every environment, so each gets its own key prefix: a staging worker never takes a production
 * job (it would not have that job's bucket) and the other way round.
 */
export function queuePrefix(env: string = appEnv()): string {
  return `bullmq-${env}`
}
```

```ts
// lib/queues/schemas.ts
import { z } from 'zod'

/** Where a job stands. Photos report the same phases as videos, `transcoding` included for a photo being encoded. */
export const JOB_PHASES = ['queued', 'downloading', 'transcoding', 'uploading', 'done', 'failed'] as const

/** What a job is about: one object in one bucket. */
export const MediaJobData = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
})
export type MediaJobData = z.infer<typeof MediaJobData>

/** What the worker writes with `job.updateProgress`, and what the site reads back. */
export const JobProgress = z.object({
  phase: z.enum(JOB_PHASES),
  percent: z.number().min(0).max(100).optional(),
  attempt: z.number().int().positive().optional(),
  error: z.string().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  updatedAt: z.number(),
})
export type JobProgress = z.infer<typeof JobProgress>
```

```ts
// lib/queues/options.ts
import { isPhotoSourceKey, isVideoSourceKey } from '@/lib/media/keys'
import type { QueueKind } from './names'

export const MAX_ATTEMPTS = 3
export const BACKOFF_MS = 10_000

/**
 * Options of every job, whoever adds it (the site on upload, the worker's scan). Finished jobs stay an hour so the
 * panel can show them; failed ones stay (five hundred) so they can be seen and retried, and a failed job's id keeps the
 * scan from adding the same object again in a loop.
 */
export const JOB_OPTIONS = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: BACKOFF_MS },
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: { count: 500 },
}

/** The job id is the object, so the queue refuses a duplicate on its own. */
export function jobIdFor(bucket: string, key: string): string {
  return `${bucket}/${key}`
}

/** Which queue takes the source object a key names, or null when the key is not something the worker processes. */
export function queueKindForKey(key: string): Extract<QueueKind, 'video' | 'photo'> | null {
  if (isVideoSourceKey(key)) return 'video'
  if (isPhotoSourceKey(key)) return 'photo'
  return null
}
```

```ts
// lib/queues/add-job.ts
import type { Queue } from 'bullmq'
import { JOB_NAMES, type QueueKind } from './names'
import { JOB_OPTIONS, jobIdFor } from './options'
import { MediaJobData } from './schemas'

/** Add one job to a queue. Used by the site when an upload ends and by the worker's scan. */
export async function addMediaJob(
  queue: Pick<Queue, 'add'>,
  kind: QueueKind,
  bucket: string,
  key: string,
): Promise<void> {
  await queue.add(JOB_NAMES[kind], MediaJobData.parse({ bucket, key }), { ...JOB_OPTIONS, jobId: jobIdFor(bucket, key) })
}
```

- [ ] **Passo 5: far passare**

Run: `npx vitest run lib/queues/queues-contract.test.ts`
Atteso: PASS.

Run: `npm run typecheck`
Atteso: nessun errore.

- [ ] **Passo 6: commit**

```bash
git add package.json package-lock.json lib/queues
git commit -m "Add the queue contract shared by the site and the worker"
```

---

### Compito 4: Redis e code per il sito (`lib/redis.ts`, `lib/queues/queues.ts`, `lib/settle.ts`)

Solo librerie: nulla del sito le usa ancora (il passaggio è il compito 14).

**File:**
- Crea: `lib/settle.ts`, `lib/redis.ts`, `lib/queues/queues.ts`, `lib/redis.test.ts`, `lib/settle.test.ts`, `lib/cache-redis-store.test.ts`
- Modifica: `lib/cache.ts` (solo l'aggiunta di `redisCacheStore`), `next.config.ts`

**Interfacce:**
- Produce:
  `settle<T>(work: Promise<T>, ms: number): Promise<T | null>`;
  `redisUrl(): string | null`, `cacheKeyPrefix(env?: string): string`, `getCacheRedis(): Redis | null`, `getQueueRedis(): Redis | null`, `resetRedisForTests(): void`;
  `getQueue(kind: QueueKind): Queue | null`;
  `redisCacheStore(redis: Pick<Redis, 'get' | 'set'>): CacheStore` (in `lib/cache.ts`).

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// lib/settle.test.ts
import { describe, expect, it } from 'vitest'
import { settle } from './settle'

describe('settle', () => {
  it('returns what the work resolves with', async () => {
    expect(await settle(Promise.resolve(42), 100)).toBe(42)
  })

  it('returns null instead of waiting for work that is too slow', async () => {
    const never = new Promise<number>(() => {})
    expect(await settle(never, 10)).toBeNull()
  })

  it('returns null instead of throwing', async () => {
    expect(await settle(Promise.reject(new Error('down')), 100)).toBeNull()
  })
})
```

```ts
// lib/redis.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cacheKeyPrefix, getCacheRedis, getQueueRedis, redisUrl, resetRedisForTests } from './redis'

describe('redis configuration', () => {
  const saved = process.env.REDIS_URL
  beforeEach(() => { delete process.env.REDIS_URL; resetRedisForTests() })
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved
    resetRedisForTests()
  })

  it('is absent without REDIS_URL, and every handle is then null: local development and CI need no Redis', () => {
    expect(redisUrl()).toBeNull()
    expect(getCacheRedis()).toBeNull()
    expect(getQueueRedis()).toBeNull()
  })

  it('treats an empty REDIS_URL as absent', () => {
    process.env.REDIS_URL = ''
    expect(redisUrl()).toBeNull()
  })

  it('prefixes cache keys with the environment, so staging and production never read each other', () => {
    expect(cacheKeyPrefix('production')).toBe('cache:production:')
    expect(cacheKeyPrefix('staging')).toBe('cache:staging:')
  })
})
```

```ts
// lib/cache-redis-store.test.ts
import { describe, expect, it } from 'vitest'
import { redisCacheStore } from './cache'

function fakeRedis() {
  const data = new Map<string, string>()
  const sets: { key: string; value: string; mode: string; ttl: number }[] = []
  return {
    sets,
    redis: {
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string, mode: 'EX', ttl: number) => {
        sets.push({ key, value, mode, ttl })
        data.set(key, value)
        return 'OK' as const
      },
    },
  }
}

describe('redisCacheStore', () => {
  it('stores values as JSON with an expiry, and reads them back parsed', async () => {
    const { redis, sets } = fakeRedis()
    const store = redisCacheStore(redis as never)
    await store.set('k', { url: 'https://x/y.m3u8', n: [1, 2] }, { ex: 600 })
    expect(sets).toEqual([{ key: 'k', value: '{"url":"https://x/y.m3u8","n":[1,2]}', mode: 'EX', ttl: 600 }])
    expect(await store.get('k')).toEqual({ url: 'https://x/y.m3u8', n: [1, 2] })
  })

  it('reads a missing key as null', async () => {
    const { redis } = fakeRedis()
    expect(await redisCacheStore(redis as never).get('nope')).toBeNull()
  })

  it('rejects on a value that is not JSON, which readThrough turns into a cache miss', async () => {
    const redis = { get: async () => 'not json', set: async () => 'OK' as const }
    await expect(redisCacheStore(redis as never).get('k')).rejects.toThrow()
  })
})
```

- [ ] **Passo 2: vederli fallire**

Run: `npx vitest run lib/settle.test.ts lib/redis.test.ts lib/cache-redis-store.test.ts`
Atteso: FAIL, moduli o esportazioni non trovati.

- [ ] **Passo 3: scrivere i moduli**

```ts
// lib/settle.ts
/**
 * Resolve with null instead of hanging or throwing.
 *
 * An external service must never hold a request or fail it: a feature-flag migration once put one on the path of every
 * request with no bound, and made the home page forty times slower. Every call out of a request goes through this.
 */
export async function settle<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
```

```ts
// lib/redis.ts
import { Redis } from 'ioredis'
import { appEnv } from '@/lib/app-env'

/**
 * The site's connections to the VM's Redis. REDIS_URL unset means "no Redis" — local development and CI — and every
 * caller treats that as a no-op, never as an error.
 *
 * Both connections fail fast: with no offline queue a command sent while Redis is unreachable rejects at once instead
 * of piling up, and the callers (lib/cache.ts, lib/queues/) already turn a rejection into "carry on without".
 */
export function redisUrl(): string | null {
  return process.env.REDIS_URL || null
}

const FAIL_FAST = { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1500 } as const

/** One Redis serves every environment, so cache keys carry the environment's name. */
export function cacheKeyPrefix(env: string = appEnv()): string {
  return `cache:${env}:`
}

let cacheRedis: Redis | null | undefined
export function getCacheRedis(): Redis | null {
  if (cacheRedis !== undefined) return cacheRedis
  const url = redisUrl()
  cacheRedis = url ? new Redis(url, { ...FAIL_FAST, keyPrefix: cacheKeyPrefix() }) : null
  cacheRedis?.on('error', (err) => console.error('[redis] cache connection:', err.message))
  return cacheRedis
}

let queueRedis: Redis | null | undefined
/** Shared by the site's BullMQ queues, which keep their own key prefix: so no `keyPrefix` here. */
export function getQueueRedis(): Redis | null {
  if (queueRedis !== undefined) return queueRedis
  const url = redisUrl()
  queueRedis = url ? new Redis(url, FAIL_FAST) : null
  queueRedis?.on('error', (err) => console.error('[redis] queue connection:', err.message))
  return queueRedis
}

/** Drop the resolved connections. Exists for tests. */
export function resetRedisForTests(): void {
  cacheRedis = undefined
  queueRedis = undefined
}
```

```ts
// lib/queues/queues.ts
import { Queue } from 'bullmq'
import { getQueueRedis } from '@/lib/redis'
import { QUEUE_NAMES, queuePrefix, type QueueKind } from './names'

const queues = new Map<QueueKind, Queue>()

/**
 * A queue as the site sees it: to add work and to look at it. Null without Redis, which callers treat as "nothing to
 * show / nothing to add", never as an error.
 */
export function getQueue(kind: QueueKind): Queue | null {
  const connection = getQueueRedis()
  if (!connection) return null
  let queue = queues.get(kind)
  if (!queue) {
    queue = new Queue(QUEUE_NAMES[kind], { connection, prefix: queuePrefix() })
    queue.on('error', (err) => console.error(`[queue:${kind}]`, err.message))
    queues.set(kind, queue)
  }
  return queue
}
```

In `lib/cache.ts`, **aggiungere** (senza toccare il resto) l'interfaccia e la funzione seguenti subito dopo la definizione di `CacheStore`:

```ts
/**
 * A CacheStore over an ioredis connection. Values go in as JSON and come back parsed, as the Upstash client used to do
 * on its own; a value that is not JSON makes `get` reject, which readThrough treats as a miss.
 */
export function redisCacheStore(redis: Pick<import('ioredis').Redis, 'get' | 'set'>): CacheStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await redis.get(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    },
    set: (key, value, { ex }) => redis.set(key, JSON.stringify(value), 'EX', ex),
  }
}
```

In `next.config.ts` sostituire la riga `  cacheComponents: true,` con:

```ts
  cacheComponents: true,
  // Native modules and Node-only clients stay out of the webpack server bundle.
  serverExternalPackages: ['bullmq', 'ioredis'],
```

- [ ] **Passo 4: far passare**

Run: `npx vitest run lib/settle.test.ts lib/redis.test.ts lib/cache-redis-store.test.ts lib/cache.test.ts`
Atteso: PASS (anche `cache.test.ts`, che non è stato toccato).

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 5: commit**

```bash
git add lib/settle.ts lib/redis.ts lib/queues/queues.ts lib/*.test.ts lib/cache.ts next.config.ts
git commit -m "Add the site's Redis connections, a Redis cache store and the queue handles"
```

---

### Compito 5: Stato, accodamento e panoramica (`lib/queues/status.ts`, `enqueue.ts`, `overview.ts`)

Solo librerie, con test sulla logica pura. Nulla è ancora collegato alle pagine.

**File:**
- Crea: `lib/queues/status.ts`, `lib/queues/enqueue.ts`, `lib/queues/overview.ts`, `lib/queues/counts.ts`, `lib/queues/status.test.ts`, `lib/queues/enqueue.test.ts`, `lib/queues/overview.test.ts`

**Interfacce:**
- Consuma: `VideoJobStatus` e `VideoJobPhase` da `@/lib/video-jobs` (restano, invariati), `QUEUE_KINDS`, `QUEUE_NAMES`, `getQueue`, `settle`, `CACHE_TIMEOUT_MS` da `@/lib/cache`, `JobProgress`, `jobIdFor`, `queueKindForKey`, `addMediaJob`.
- Produce:
  `type JobSnapshot = { state: string; progress: unknown; attemptsMade: number; failedReason?: string; returnvalue?: unknown }`,
  `statusFromSnapshot(job: JobSnapshot, now?: number): VideoJobStatus`,
  `readStatusFromQueue(queue: Pick<Queue, 'getJob'>, jobId: string): Promise<VideoJobStatus | null>`,
  `readJobStatus(storageKey: string, bucket?: string): Promise<VideoJobStatus | null>`;
  `type EnqueueOutcome = 'queued' | 'skipped' | 'unavailable'`, `enqueueMediaJob(storageKey: string, options?: { bucket?: string; queue?: Pick<Queue, 'add'> | null }): Promise<EnqueueOutcome>`;
  `type ActiveJob`, `type QueueCounts`, `type QueueSnapshot`, `type Schedule`, `type WorkerHeartbeat`, `buildHeartbeat(input: HeartbeatInput): WorkerHeartbeat | null`, `parseMeminfo(text: string): { usedMb: number; totalMb: number } | null`, `readWorkerHeartbeat(): Promise<WorkerHeartbeat | null>`;
  `countJobs(perQueue: (Record<string, number> | null)[]): number`.

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// lib/queues/status.test.ts
import { describe, expect, it } from 'vitest'
import type { Queue } from 'bullmq'
import { readStatusFromQueue, statusFromSnapshot } from './status'

const NOW = 1_700_000_000_000
const SHA = 'a'.repeat(64)

describe('statusFromSnapshot', () => {
  it('reports a job that has not started as queued', () => {
    for (const state of ['waiting', 'prioritized', 'paused', 'waiting-children']) {
      expect(statusFromSnapshot({ state, progress: 0, attemptsMade: 0 }, NOW)).toEqual({ phase: 'queued', attempt: undefined, updatedAt: NOW })
    }
  })

  it('reports a job waiting to be retried as queued, naming the attempt that is coming', () => {
    expect(statusFromSnapshot({ state: 'delayed', progress: 0, attemptsMade: 1 }, NOW)).toMatchObject({ phase: 'queued', attempt: 2 })
  })

  it('reports a running job by the phase and percentage it last wrote', () => {
    const progress = { phase: 'transcoding', percent: 40, attempt: 1, updatedAt: 123 }
    expect(statusFromSnapshot({ state: 'active', progress, attemptsMade: 0 }, NOW)).toEqual({
      phase: 'transcoding', progress: 40, attempt: 1, updatedAt: 123,
    })
  })

  it('reports a running job that has not written anything yet as downloading', () => {
    expect(statusFromSnapshot({ state: 'active', progress: 0, attemptsMade: 1 }, NOW)).toEqual({
      phase: 'downloading', progress: undefined, attempt: 2, updatedAt: NOW,
    })
  })

  it('never reports done or failed for a job that is still active', () => {
    const progress = { phase: 'done', updatedAt: 1 }
    expect(statusFromSnapshot({ state: 'active', progress, attemptsMade: 0 }, NOW).phase).toBe('downloading')
  })

  it('reports a finished job as done, with the hash the job returned', () => {
    expect(statusFromSnapshot({ state: 'completed', progress: { phase: 'done', updatedAt: 9 }, attemptsMade: 0, returnvalue: { sha256: SHA } }, NOW))
      .toEqual({ phase: 'done', progress: 100, updatedAt: 9, sha256: SHA })
  })

  it('ignores a returned hash that is not a SHA-256', () => {
    expect(statusFromSnapshot({ state: 'completed', progress: 0, attemptsMade: 0, returnvalue: { sha256: 'nope' } }, NOW).sha256).toBeUndefined()
  })

  it('reports a job that gave up as failed, with its reason cut to 500 characters', () => {
    const long = 'x'.repeat(900)
    const status = statusFromSnapshot({ state: 'failed', progress: 0, attemptsMade: 3, failedReason: long }, NOW)
    expect(status).toMatchObject({ phase: 'failed', attempt: 3 })
    expect(status.error).toHaveLength(500)
  })

  it('says something when a failure has no reason', () => {
    expect(statusFromSnapshot({ state: 'failed', progress: 0, attemptsMade: 3 }, NOW).error).toBe('Processing failed')
  })

  it('treats an unknown state as queued rather than failing the panel', () => {
    expect(statusFromSnapshot({ state: 'unknown', progress: null, attemptsMade: 0 }, NOW).phase).toBe('queued')
  })
})

describe('readStatusFromQueue', () => {
  it('returns null for a job the queue does not know, the way the panel already expects', async () => {
    const queue = { getJob: async () => undefined } as unknown as Pick<Queue, 'getJob'>
    expect(await readStatusFromQueue(queue, 'b/k')).toBeNull()
  })

  it('reads the state, progress and outcome of the job', async () => {
    const job = {
      getState: async () => 'active',
      progress: { phase: 'uploading', percent: 99, attempt: 1, updatedAt: 7 },
      attemptsMade: 0,
      failedReason: undefined,
      returnvalue: undefined,
    }
    const queue = { getJob: async (id: string) => (id === 'b/k' ? job : undefined) } as unknown as Pick<Queue, 'getJob'>
    expect(await readStatusFromQueue(queue, 'b/k')).toMatchObject({ phase: 'uploading', progress: 99 })
  })
})
```

```ts
// lib/queues/enqueue.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Queue } from 'bullmq'
import { enqueueMediaJob } from './enqueue'
import { JOB_OPTIONS } from './options'

const queueOf = (add: unknown) => ({ add }) as unknown as Pick<Queue, 'add'>

describe('enqueueMediaJob', () => {
  it('queues a staged photo under its object as the id', async () => {
    const add = vi.fn(async () => ({}))
    const outcome = await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: queueOf(add) })
    expect(outcome).toBe('queued')
    expect(add).toHaveBeenCalledWith('process', { bucket: 'b', key: 'private/route-photos/r1/u1.jpg' }, { ...JOB_OPTIONS, jobId: 'b/private/route-photos/r1/u1.jpg' })
  })

  it('queues a video on the video queue', async () => {
    const add = vi.fn(async (..._args: unknown[]) => ({}))
    await enqueueMediaJob('private/bike-model-videos/m1/u1.MOV', { bucket: 'b', queue: queueOf(add) })
    expect(add.mock.calls[0][0]).toBe('transcode')
  })

  it('skips a key the worker does not process, without touching the queue', async () => {
    const add = vi.fn()
    expect(await enqueueMediaJob('route-gpx/r1/track.gpx', { bucket: 'b', queue: queueOf(add) })).toBe('skipped')
    expect(add).not.toHaveBeenCalled()
  })

  it('skips when there is no bucket to name the job after', async () => {
    delete process.env.R2_BUCKET_NAME
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { queue: queueOf(vi.fn()) })).toBe('skipped')
  })

  it('says unavailable, and does not throw, when there is no Redis', async () => {
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: null })).toBe('unavailable')
  })

  it('says unavailable, and does not throw, when Redis refuses: an upload must not fail because the queue is down', async () => {
    const add = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await enqueueMediaJob('private/route-photos/r1/u1.jpg', { bucket: 'b', queue: queueOf(add) })).toBe('unavailable')
    log.mockRestore()
  })
})
```

```ts
// lib/queues/overview.test.ts
import { describe, expect, it } from 'vitest'
import { buildHeartbeat, parseMeminfo } from './overview'
import { countJobs } from './counts'

const queue = (workers: number, active = 0) => ({
  counts: { waiting: 1, active },
  active: active ? [{ id: 'b/private/route-videos/r/u.mp4', data: { bucket: 'b' }, attempt: 1, startedAt: 5 }] : [],
  workers,
})

describe('buildHeartbeat', () => {
  const base = { now: 1000, cpuCount: 2, load: { '1m': 0.5 }, memory: { usedMb: 100, totalMb: 4000 } }

  it('describes the worker when at least one queue has a worker connected', () => {
    const heartbeat = buildHeartbeat({ ...base, queues: { 'video-transcode': queue(1, 1), 'image-process': queue(0) } })
    expect(heartbeat).toMatchObject({ updatedAt: 1000, cpuCount: 2, schedules: [] })
    expect(Object.keys(heartbeat!.queues)).toEqual(['video-transcode', 'image-process'])
  })

  it('says nothing when no worker is connected: the panel then says there is no worker', () => {
    expect(buildHeartbeat({ ...base, queues: { 'video-transcode': queue(0), 'image-process': queue(0) } })).toBeNull()
  })
})

describe('parseMeminfo', () => {
  it('reads total and available memory from /proc/meminfo', () => {
    const text = 'MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    8192000 kB\n'
    expect(parseMeminfo(text)).toEqual({ usedMb: 8000, totalMb: 16000 })
  })

  it('returns null for text that is not meminfo', () => {
    expect(parseMeminfo('nope')).toBeNull()
  })
})

describe('countJobs', () => {
  it('adds up every count of every queue, treating a queue that did not answer as empty', () => {
    expect(countJobs([{ waiting: 2, active: 1 }, null, { failed: 3 }])).toBe(6)
    expect(countJobs([])).toBe(0)
  })
})
```

- [ ] **Passo 2: vederli fallire**

Run: `npx vitest run lib/queues/status.test.ts lib/queues/enqueue.test.ts lib/queues/overview.test.ts`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 3: scrivere i moduli**

```ts
// lib/queues/status.ts
import type { Queue } from 'bullmq'
import { z } from 'zod'
import { CACHE_TIMEOUT_MS } from '@/lib/cache'
import { settle } from '@/lib/settle'
import type { VideoJobPhase, VideoJobStatus } from '@/lib/video-jobs'
import { jobIdFor, queueKindForKey } from './options'
import { getQueue } from './queues'
import { JobProgress } from './schemas'

/**
 * Where a job stands, read from the queue itself. The worker used to publish a status into a second store under keys
 * both repositories had to agree on; the queue already knows state, progress, attempts and failure, so the site asks it.
 *
 * Nothing here trusts what comes back: progress is parsed, because it was written by another process.
 */

const Returned = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })

export interface JobSnapshot {
  /** BullMQ's own word: waiting, active, delayed, completed, failed, prioritized, paused… */
  state: string
  progress: unknown
  attemptsMade: number
  failedReason?: string
  returnvalue?: unknown
}

const RUNNING_PHASES: readonly string[] = ['downloading', 'transcoding', 'uploading']

export function statusFromSnapshot(job: JobSnapshot, now: number = Date.now()): VideoJobStatus {
  const parsed = JobProgress.safeParse(job.progress)
  const written = parsed.success ? parsed.data : undefined
  const updatedAt = written?.updatedAt ?? now

  switch (job.state) {
    case 'completed': {
      const returned = Returned.safeParse(job.returnvalue)
      return { phase: 'done', progress: 100, updatedAt, sha256: returned.success ? returned.data.sha256 : written?.sha256 }
    }
    case 'failed':
      return {
        phase: 'failed',
        attempt: job.attemptsMade,
        error: (job.failedReason || 'Processing failed').slice(0, 500),
        updatedAt,
      }
    case 'active': {
      const phase: VideoJobPhase = written && RUNNING_PHASES.includes(written.phase) ? written.phase : 'downloading'
      return { phase, progress: written?.percent, attempt: written?.attempt ?? job.attemptsMade + 1, updatedAt }
    }
    default:
      // Waiting, paused, prioritized, and delayed (the wait between two attempts).
      return { phase: 'queued', attempt: job.state === 'delayed' ? job.attemptsMade + 1 : undefined, updatedAt }
  }
}

export async function readStatusFromQueue(
  queue: Pick<Queue, 'getJob'>,
  jobId: string,
): Promise<VideoJobStatus | null> {
  const job = await queue.getJob(jobId)
  if (!job) return null
  return statusFromSnapshot({
    state: await job.getState(),
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
  })
}

/** Status of the job for an uploaded object, or null: no Redis, no such job, or Redis too slow to answer. */
export async function readJobStatus(
  storageKey: string,
  bucket: string | undefined = process.env.R2_BUCKET_NAME,
): Promise<VideoJobStatus | null> {
  const kind = queueKindForKey(storageKey)
  if (!kind || !bucket) return null
  const queue = getQueue(kind)
  if (!queue) return null
  return settle(readStatusFromQueue(queue, jobIdFor(bucket, storageKey)), CACHE_TIMEOUT_MS)
}
```

```ts
// lib/queues/enqueue.ts
import type { Queue } from 'bullmq'
import { addMediaJob } from './add-job'
import { queueKindForKey } from './options'
import { getQueue } from './queues'

export type EnqueueOutcome = 'queued' | 'skipped' | 'unavailable'

export interface EnqueueOptions {
  /** Defaults to the bucket of this environment. */
  bucket?: string
  /** Defaults to the real queue; tests pass their own, `null` means "no Redis". */
  queue?: Pick<Queue, 'add'> | null
}

/**
 * Hand an uploaded object to the worker now, instead of waiting for its next scan.
 *
 * Never throws and never fails an upload: if the queue is down the scan finds the file within minutes, which is the
 * reason the scan exists. Adding the same object twice is harmless, the job id is the object.
 */
export async function enqueueMediaJob(storageKey: string, options: EnqueueOptions = {}): Promise<EnqueueOutcome> {
  const kind = queueKindForKey(storageKey)
  const bucket = options.bucket ?? process.env.R2_BUCKET_NAME
  if (!kind || !bucket) return 'skipped'

  const queue = options.queue !== undefined ? options.queue : getQueue(kind)
  if (!queue) return 'unavailable'

  try {
    await addMediaJob(queue, kind, bucket, storageKey)
    return 'queued'
  } catch (err) {
    console.error('[queue] could not enqueue', storageKey, err instanceof Error ? err.message : err)
    return 'unavailable'
  }
}
```

```ts
// lib/queues/counts.ts
/** Sum of every count of every queue; a queue that did not answer counts as empty. For the developer page. */
export function countJobs(perQueue: (Record<string, number> | null)[]): number {
  return perQueue.reduce((sum, counts) => sum + Object.values(counts ?? {}).reduce((a, b) => a + b, 0), 0)
}
```

```ts
// lib/queues/overview.ts
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { settle } from '@/lib/settle'
import { QUEUE_KINDS, QUEUE_NAMES } from './names'
import { getQueue } from './queues'

/**
 * The shape of the whole worker — queue depth, what is running, the machine's own load — for the developer page.
 *
 * It used to be a snapshot the worker published every fifteen seconds. Now the site reads the queues itself, asks which
 * workers are connected, and reads load and memory from the machine, which is the same machine.
 */

export interface QueueCounts {
  waiting?: number
  active?: number
  completed?: number
  failed?: number
  delayed?: number
  [status: string]: number | undefined
}

export interface ActiveJob {
  id: string
  data: unknown
  attempt: number
  /** Epoch milliseconds the job started running, or null if unavailable. */
  startedAt: number | null
}

export interface QueueSnapshot {
  counts: QueueCounts
  active: ActiveJob[]
  /** How many workers are connected to this queue right now. */
  workers: number
}

export interface Schedule {
  id: string
  queue: string
  pattern: string
}

export interface WorkerHeartbeat {
  updatedAt: number
  cpuCount: number | null
  load: { '1m'?: number; '5m'?: number; '15m'?: number }
  memory: { usedMb: number; totalMb: number } | null
  queues: Record<string, QueueSnapshot>
  schedules: Schedule[]
}

export interface HeartbeatInput {
  now: number
  cpuCount: number | null
  load: WorkerHeartbeat['load']
  memory: WorkerHeartbeat['memory']
  queues: Record<string, QueueSnapshot>
}

/** Null when no worker is connected to any queue: the page then says so instead of showing zeros. */
export function buildHeartbeat(input: HeartbeatInput): WorkerHeartbeat | null {
  const connected = Object.values(input.queues).some((queue) => queue.workers > 0)
  if (!connected) return null
  return {
    updatedAt: input.now,
    cpuCount: input.cpuCount,
    load: input.load,
    memory: input.memory,
    queues: input.queues,
    schedules: [],
  }
}

/** Linux only. Reads total and available memory from the text of /proc/meminfo (kB). */
export function parseMeminfo(text: string): { usedMb: number; totalMb: number } | null {
  const kb = (name: string) => {
    const match = new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm').exec(text)
    return match ? Number(match[1]) : null
  }
  const total = kb('MemTotal')
  if (total === null) return null
  const available = kb('MemAvailable') ?? total
  return { usedMb: Math.floor((total - available) / 1024), totalMb: Math.floor(total / 1024) }
}

async function hostMemory(): Promise<WorkerHeartbeat['memory']> {
  try {
    return parseMeminfo(await readFile('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

const OVERVIEW_TIMEOUT_MS = 2000

export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const loadavg = os.loadavg()
  const snapshot = await settle(
    Promise.all(
      QUEUE_KINDS.map(async (kind) => {
        const queue = getQueue(kind)
        if (!queue) return null
        const [counts, active, workers] = await Promise.all([
          queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
          queue.getActive(),
          queue.getWorkers(),
        ])
        const entry: QueueSnapshot = {
          counts,
          active: active.map((job) => ({
            id: job.id ?? '',
            data: job.data,
            attempt: job.attemptsMade + 1,
            startedAt: job.processedOn ?? null,
          })),
          workers: workers.length,
        }
        return [QUEUE_NAMES[kind], entry] as const
      }),
    ),
    OVERVIEW_TIMEOUT_MS,
  )
  if (!snapshot || snapshot.some((entry) => entry === null)) return null

  return buildHeartbeat({
    now: Date.now(),
    cpuCount: os.cpus().length || null,
    load: { '1m': loadavg[0], '5m': loadavg[1], '15m': loadavg[2] },
    memory: await hostMemory(),
    queues: Object.fromEntries(snapshot as (readonly [string, QueueSnapshot])[]),
  })
}
```

- [ ] **Passo 4: far passare**

Run: `npx vitest run lib/queues`
Atteso: PASS (contratto, stato, accodamento, panoramica).

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 5: commit**

```bash
git add lib/queues
git commit -m "Read job status from the queue, enqueue on upload and describe the worker for the panel"
```


---

### Compito 6: Fondamenta del worker

Configurazione, log, hash, avanzamento e accesso allo storage, con un'interfaccia (`ObjectStore`) che i test sostituiscono con una cartella.

**File:**
- Crea: `worker/config.ts`, `worker/logger.ts`, `worker/hash.ts`, `worker/progress.ts`, `worker/storage.ts`, `worker/jobs/types.ts`, `worker/testing/dir-store.ts`
- Test: `worker/config.test.ts`, `worker/hash.test.ts`, `worker/progress.test.ts`, `worker/testing/dir-store.test.ts`
- Modifica: `package.json` (dipendenze), `vitest.config.ts`

**Interfacce:**
- Produce:
  `loadConfig(env?: NodeJS.ProcessEnv): WorkerConfig` con `WorkerConfig = { appEnv: 'production' | 'staging'; redisUrl: string; r2: { accountId: string; accessKeyId: string; secretAccessKey: string }; buckets: string[]; workdirBase: string; scanIntervalS: number; imaging: ImagingConfig; logLevel: string }`;
  `log: pino.Logger`, `type Logger = pino.Logger`;
  `sha256OfFile(path: string): Promise<string>`;
  `progressReporter(job: ProgressTarget, attempt: number): (phase: JobProgress['phase'], extra?: { percent?: number; sha256?: string }) => Promise<void>`;
  `interface ObjectStore { exists(bucket, key): Promise<boolean>; list(bucket, prefix): Promise<string[]>; download(bucket, key, destPath): Promise<void>; upload(bucket, key, srcPath, opts: { contentType: string; cacheControl?: string }): Promise<void>; remove(bucket, key): Promise<void> }`,
  `class MissingObjectError extends Error`, `s3Store(r2: WorkerConfig['r2']): ObjectStore`;
  `interface MediaJob { data: unknown; attemptsMade: number; opts: { attempts?: number }; updateProgress(value: object): Promise<void> }`;
  `dirStore(root: string): ObjectStore & { uploads: UploadRecord[]; removed: string[] }` (solo per i test).

- [ ] **Passo 1: dipendenze e configurazione dei test**

```bash
npm install pino p-limit @aws-sdk/lib-storage
npm install -D esbuild
```

In `vitest.config.ts` sostituire la riga `include:` con:

```ts
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'worker/**/*.test.ts'],
```

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// worker/config.test.ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const valid = {
  APP_ENV: 'staging',
  REDIS_URL: 'redis://worker:secret@redis:6379',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKETS: 'dev-lelettrica-trails',
}

describe('loadConfig', () => {
  it('reads a valid environment and fills in the defaults', () => {
    const config = loadConfig(valid)
    expect(config).toMatchObject({
      appEnv: 'staging',
      redisUrl: 'redis://worker:secret@redis:6379',
      r2: { accountId: 'acct', accessKeyId: 'key', secretAccessKey: 'secret' },
      buckets: ['dev-lelettrica-trails'],
      workdirBase: '/tmp/work',
      scanIntervalS: 600,
      imaging: { maxEdge: 2400, quality: 65, effort: 3, shareEdge: 1200, shareQuality: 82 },
    })
  })

  it('splits and trims a list of buckets', () => {
    expect(loadConfig({ ...valid, R2_BUCKETS: ' a , b ,, ' }).buckets).toEqual(['a', 'b'])
  })

  it('takes the imaging settings from the environment', () => {
    const config = loadConfig({ ...valid, IMAGE_QUALITY: '70', IMAGE_EFFORT: '4', IMAGE_MAX_EDGE: '3000' })
    expect(config.imaging).toMatchObject({ quality: 70, effort: 4, maxEdge: 3000 })
  })

  it('names the variable that is missing', () => {
    const { REDIS_URL, ...rest } = valid
    void REDIS_URL
    expect(() => loadConfig(rest)).toThrow(/REDIS_URL/)
  })

  it('refuses an environment that is neither production nor staging', () => {
    expect(() => loadConfig({ ...valid, APP_ENV: 'development' })).toThrow(/APP_ENV/)
  })

  it('refuses an empty list of buckets', () => {
    expect(() => loadConfig({ ...valid, R2_BUCKETS: ' , ' })).toThrow(/R2_BUCKETS/)
  })
})
```

```ts
// worker/hash.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256OfFile } from './hash'

describe('sha256OfFile', () => {
  it('hashes a file the way sha256sum would', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hash-'))
    try {
      const file = join(dir, 'abc.txt')
      await writeFile(file, 'abc')
      expect(await sha256OfFile(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

```ts
// worker/progress.test.ts
import { describe, expect, it, vi } from 'vitest'
import { JobProgress } from '@/lib/queues/schemas'
import { progressReporter } from './progress'

describe('progressReporter', () => {
  it('writes the phase, the attempt and a timestamp the site can parse', async () => {
    const updateProgress = vi.fn(async (_value: object) => {})
    const report = progressReporter({ updateProgress }, 2)
    await report('transcoding', { percent: 35 })

    const written = updateProgress.mock.calls[0][0]
    expect(JobProgress.safeParse(written).success).toBe(true)
    expect(written).toMatchObject({ phase: 'transcoding', percent: 35, attempt: 2 })
  })

  it('carries the hash when a job is done', async () => {
    const updateProgress = vi.fn(async (_value: object) => {})
    await progressReporter({ updateProgress }, 1)('done', { percent: 100, sha256: 'b'.repeat(64) })
    expect(updateProgress.mock.calls[0][0]).toMatchObject({ phase: 'done', sha256: 'b'.repeat(64) })
  })
})
```

```ts
// worker/testing/dir-store.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MissingObjectError } from '../storage'
import { dirStore } from './dir-store'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'store-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function put(bucket: string, key: string, content: string) {
  const file = join(root, bucket, ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

describe('dirStore', () => {
  it('knows which objects exist', async () => {
    await put('b', 'private/route-photos/r/u.jpg', 'x')
    const store = dirStore(root)
    expect(await store.exists('b', 'private/route-photos/r/u.jpg')).toBe(true)
    expect(await store.exists('b', 'private/route-photos/r/other.jpg')).toBe(false)
    expect(await store.exists('other-bucket', 'private/route-photos/r/u.jpg')).toBe(false)
  })

  it('lists keys under a prefix, in order, across folders', async () => {
    await put('b', 'private/route-photos/r1/b.jpg', 'x')
    await put('b', 'private/route-photos/r1/a.jpg', 'x')
    await put('b', 'private/route-photos/r2/c.png', 'x')
    await put('b', 'public/route-photos/r1/u.avif', 'x')
    expect(await dirStore(root).list('b', 'private/route-photos/')).toEqual([
      'private/route-photos/r1/a.jpg',
      'private/route-photos/r1/b.jpg',
      'private/route-photos/r2/c.png',
    ])
    expect(await dirStore(root).list('missing-bucket', 'private/')).toEqual([])
  })

  it('downloads a copy, and says so with MissingObjectError when there is nothing to download', async () => {
    await put('b', 'k/file.bin', 'hello')
    const store = dirStore(root)
    const dest = join(root, 'out', 'copy.bin')
    await store.download('b', 'k/file.bin', dest)
    expect(await readFile(dest, 'utf8')).toBe('hello')
    await expect(store.download('b', 'k/none.bin', dest)).rejects.toBeInstanceOf(MissingObjectError)
  })

  it('records every upload, in order, with its headers, and stores the content', async () => {
    const source = join(root, 'src.avif')
    await writeFile(source, 'avif')
    const store = dirStore(root)
    await store.upload('b', 'public/x/u.w480.avif', source, { contentType: 'image/avif', cacheControl: 'immutable' })
    await store.upload('b', 'public/x/u.avif', source, { contentType: 'image/avif' })
    expect(store.uploads).toEqual([
      { bucket: 'b', key: 'public/x/u.w480.avif', contentType: 'image/avif', cacheControl: 'immutable' },
      { bucket: 'b', key: 'public/x/u.avif', contentType: 'image/avif' },
    ])
    expect(await store.exists('b', 'public/x/u.avif')).toBe(true)
  })

  it('removes an object and remembers having done so', async () => {
    await put('b', 'k/f', 'x')
    const store = dirStore(root)
    await store.remove('b', 'k/f')
    expect(await store.exists('b', 'k/f')).toBe(false)
    expect(store.removed).toEqual(['b/k/f'])
  })
})
```

- [ ] **Passo 3: vederli fallire**

Run: `npx vitest run worker`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 4: scrivere i moduli**

```ts
// worker/config.ts
import { z } from 'zod'

/**
 * Everything the worker reads from its environment, parsed once at start. A missing or malformed value stops the
 * process with the name of the variable, instead of failing on the first photo.
 */
const Env = z.object({
  APP_ENV: z.enum(['production', 'staging']),
  REDIS_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKETS: z
    .string()
    .transform((value) => value.split(',').map((bucket) => bucket.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1)),
  WORKDIR_BASE: z.string().default('/tmp/work'),
  SCAN_INTERVAL_S: z.coerce.number().int().positive().default(600),
  IMAGE_MAX_EDGE: z.coerce.number().int().positive().default(2400),
  IMAGE_QUALITY: z.coerce.number().int().min(1).max(100).default(65),
  IMAGE_EFFORT: z.coerce.number().int().min(0).max(9).default(3),
  IMAGE_SHARE_EDGE: z.coerce.number().int().positive().default(1200),
  IMAGE_SHARE_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
  LOG_LEVEL: z.string().default('info'),
})

export interface ImagingConfig {
  maxEdge: number
  quality: number
  /** CPU effort of the AVIF encoder, 0 (fastest) to 9. 3 is the speed 6 of the Pillow encoder this replaced (effort = 9 - speed). */
  effort: number
  shareEdge: number
  shareQuality: number
}

export interface WorkerConfig {
  appEnv: 'production' | 'staging'
  redisUrl: string
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string }
  buckets: string[]
  workdirBase: string
  scanIntervalS: number
  imaging: ImagingConfig
  logLevel: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = Env.safeParse(env)
  if (!parsed.success) throw new Error(`Invalid worker environment:\n${z.prettifyError(parsed.error)}`)
  const e = parsed.data
  return {
    appEnv: e.APP_ENV,
    redisUrl: e.REDIS_URL,
    r2: { accountId: e.R2_ACCOUNT_ID, accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
    buckets: e.R2_BUCKETS,
    workdirBase: e.WORKDIR_BASE,
    scanIntervalS: e.SCAN_INTERVAL_S,
    imaging: {
      maxEdge: e.IMAGE_MAX_EDGE,
      quality: e.IMAGE_QUALITY,
      effort: e.IMAGE_EFFORT,
      shareEdge: e.IMAGE_SHARE_EDGE,
      shareQuality: e.IMAGE_SHARE_QUALITY,
    },
    logLevel: e.LOG_LEVEL,
  }
}
```

```ts
// worker/logger.ts
import pino from 'pino'

/** Structured JSON on stdout: `docker logs` reads it, and so can anything that parses lines. */
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
export type Logger = pino.Logger
```

```ts
// worker/hash.ts
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** Streamed, not loaded whole: a source can be a multi-gigabyte video. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
```

```ts
// worker/progress.ts
import type { JobProgress } from '@/lib/queues/schemas'

export interface ProgressTarget {
  updateProgress(value: object): Promise<void>
}

/**
 * What a job writes as it goes. The site reads it back (lib/queues/status.ts) to draw the bar, so the shape is
 * JobProgress and nothing else.
 */
export function progressReporter(job: ProgressTarget, attempt: number) {
  return (phase: JobProgress['phase'], extra: { percent?: number; sha256?: string } = {}): Promise<void> =>
    job.updateProgress({ phase, attempt, updatedAt: Date.now(), ...extra })
}
```

```ts
// worker/jobs/types.ts
/** The part of a BullMQ job the handlers use, so that tests can hand them a plain object. */
export interface MediaJob {
  data: unknown
  attemptsMade: number
  opts: { attempts?: number }
  updateProgress(value: object): Promise<void>
}
```

```ts
// worker/storage.ts
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { WorkerConfig } from './config'

/**
 * Object storage as the worker needs it. An interface, so that the jobs are tested against a folder (see
 * testing/dir-store.ts) and only this file knows about R2.
 */
export interface ObjectStore {
  exists(bucket: string, key: string): Promise<boolean>
  list(bucket: string, prefix: string): Promise<string[]>
  download(bucket: string, key: string, destPath: string): Promise<void>
  upload(
    bucket: string,
    key: string,
    srcPath: string,
    options: { contentType: string; cacheControl?: string },
  ): Promise<void>
  remove(bucket: string, key: string): Promise<void>
}

/** The object a job is about is not there: already processed by someone else, or never uploaded. */
export class MissingObjectError extends Error {
  constructor(what: string) {
    super(`Object not found: ${what}`)
    this.name = 'MissingObjectError'
  }
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof NoSuchKey ||
    (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound'))
  )
}

export function s3Store(r2: WorkerConfig['r2']): ObjectStore {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    // R2 rejects the trailing checksums newer SDKs send by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  return {
    async exists(bucket, key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (err) {
        // Only "not there" means not there. Treating any error as absence would queue work twice on a hiccup.
        if (isNotFound(err)) return false
        throw err
      }
    },

    async list(bucket, prefix) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        )
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key)
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return keys
    },

    async download(bucket, key, destPath) {
      let body: Readable
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        body = res.Body as Readable
      } catch (err) {
        if (isNotFound(err)) throw new MissingObjectError(`${bucket}/${key}`)
        throw err
      }
      await mkdir(dirname(destPath), { recursive: true })
      await pipeline(body, createWriteStream(destPath))
    },

    async upload(bucket, key, srcPath, { contentType, cacheControl }) {
      const upload = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: createReadStream(srcPath), ContentType: contentType, CacheControl: cacheControl },
        queueSize: 4,
        partSize: 8 * 1024 * 1024,
      })
      await upload.done()
    },

    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}
```

```ts
// worker/testing/dir-store.ts
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MissingObjectError, type ObjectStore } from '../storage'

export interface UploadRecord {
  bucket: string
  key: string
  contentType: string
  cacheControl?: string
}

/** An ObjectStore over a folder (one subfolder per bucket), for tests. Remembers what was uploaded and in which order. */
export function dirStore(root: string): ObjectStore & { uploads: UploadRecord[]; removed: string[] } {
  const uploads: UploadRecord[] = []
  const removed: string[] = []
  const pathOf = (bucket: string, key: string) => join(root, bucket, ...key.split('/'))

  async function exists(bucket: string, key: string): Promise<boolean> {
    try {
      return (await stat(pathOf(bucket, key))).isFile()
    } catch {
      return false
    }
  }

  async function walk(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      const key = prefix + entry.name
      if (entry.isDirectory()) found.push(...(await walk(join(dir, entry.name), key + '/')))
      else found.push(key)
    }
    return found
  }

  return {
    uploads,
    removed,
    exists,
    async list(bucket, prefix) {
      return (await walk(join(root, bucket), '')).filter((key) => key.startsWith(prefix)).sort()
    },
    async download(bucket, key, destPath) {
      if (!(await exists(bucket, key))) throw new MissingObjectError(`${bucket}/${key}`)
      await mkdir(dirname(destPath), { recursive: true })
      await cp(pathOf(bucket, key), destPath)
    },
    async upload(bucket, key, srcPath, options) {
      const target = pathOf(bucket, key)
      await mkdir(dirname(target), { recursive: true })
      await cp(srcPath, target)
      uploads.push({ bucket, key, ...options })
    },
    async remove(bucket, key) {
      await rm(pathOf(bucket, key), { force: true })
      removed.push(`${bucket}/${key}`)
    },
  }
}
```

- [ ] **Passo 5: far passare**

Run: `npx vitest run worker`
Atteso: PASS.

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 6: commit**

```bash
git add package.json package-lock.json vitest.config.ts worker
git commit -m "Add the worker's foundations: config, log, hash, progress and an object store"
```

---

### Compito 7: Elaborazione delle foto (`worker/imaging.ts`, `worker/heic.ts`)

`sharp` al posto di Pillow. Un solo decode, poi master, anteprima JPEG e le tre versioni dalla stessa immagine in memoria. Le regole sono quelle del codice Python e dei suoi test.

**File:**
- Crea: `worker/imaging.ts`, `worker/heic.ts`, `worker/types/libheif-js.d.ts`, `worker/testing/images.ts`
- Test: `worker/imaging.test.ts`, `worker/heic.test.ts`

**Interfacce:**
- Consuma: `ImagingConfig` da `worker/config`, `RENDITION_WIDTHS`, `extensionOf` da `@/lib/media/keys`, `worker/fixtures/sample.heic` (compito 1).
- Produce:
  `PIXEL_LIMIT = 300_000_000`, `type RawImage = { data: Buffer; width: number; height: number }`,
  `type PhotoOutputs = { master: string; share: string; renditions: Record<number, string> }`,
  `renderPhoto(source: string | RawImage, outputs: PhotoOutputs, config: ImagingConfig): Promise<{ width: number; height: number }>`,
  `cutRenditions(masterPath: string, paths: Record<number, string>, config: ImagingConfig): Promise<{ width: number; height: number }>`;
  `isHeicKey(key: string): boolean`, `decodeHeic(file: Buffer): Promise<RawImage>`;
  nei test: `testImagingConfig: ImagingConfig`, `makeImage(options): Promise<Buffer>`.

- [ ] **Passo 1: gli aiuti per i test**

```ts
// worker/testing/images.ts
import sharp from 'sharp'
import type { ImagingConfig } from '../config'

/** The production defaults, so that a test measures what production does. */
export const testImagingConfig: ImagingConfig = { maxEdge: 2400, quality: 65, effort: 3, shareEdge: 1200, shareQuality: 82 }

export interface ImageOptions {
  width: number
  height: number
  background?: { r: number; g: number; b: number; alpha?: number }
  channels?: 3 | 4
}

/** A plain-colour PNG of the given size, with or without transparency. */
export function makeImage({ width, height, background = { r: 10, g: 120, b: 200 }, channels = 3 }: ImageOptions): Promise<Buffer> {
  return sharp({ create: { width, height, channels, background } }).png().toBuffer()
}
```

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// worker/imaging.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cutRenditions, renderPhoto, type PhotoOutputs } from './imaging'
import { makeImage, testImagingConfig } from './testing/images'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'imaging-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const outputs = (): PhotoOutputs => ({
  master: join(dir, 'master.avif'),
  share: join(dir, 'share.jpg'),
  renditions: { 480: join(dir, 'w480.avif'), 960: join(dir, 'w960.avif'), 1600: join(dir, 'w1600.avif') },
})

async function source(buffer: Buffer, name = 'in.png'): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, buffer)
  return path
}

const meta = (path: string) => sharp(path).metadata()

describe('renderPhoto', () => {
  it('fits a large photo in 2400 px, never up, and cuts the link preview and the renditions from it', async () => {
    const out = outputs()
    const size = await renderPhoto(await source(await makeImage({ width: 5000, height: 3000 })), out, testImagingConfig)

    expect(size).toEqual({ width: 2400, height: 1440 })
    expect(await meta(out.master)).toMatchObject({ format: 'heif', width: 2400, height: 1440 })
    expect(await meta(out.share)).toMatchObject({ format: 'jpeg', width: 1200, height: 720 })
    expect(await meta(out.renditions[480])).toMatchObject({ width: 480, height: 288 })
    expect(await meta(out.renditions[960])).toMatchObject({ width: 960, height: 576 })
    expect(await meta(out.renditions[1600])).toMatchObject({ width: 1600, height: 960 })
  })

  it('keeps a small photo at its own size and gives every rendition the same size, never enlarged', async () => {
    const out = outputs()
    const size = await renderPhoto(await source(await makeImage({ width: 100, height: 100 })), out, testImagingConfig)

    expect(size).toEqual({ width: 100, height: 100 })
    for (const width of [480, 960, 1600]) expect(await meta(out.renditions[width])).toMatchObject({ width: 100, height: 100 })
    expect(await meta(out.share)).toMatchObject({ width: 100, height: 100 })
  })

  it('turns a portrait photo the right way up from its EXIF orientation (a phone held upright)', async () => {
    const landscape = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#336699' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const out = outputs()

    const size = await renderPhoto(await source(landscape, 'in.jpg'), out, testImagingConfig)

    expect(size).toEqual({ width: 200, height: 400 })
    expect(await meta(out.master)).toMatchObject({ width: 200, height: 400 })
  })

  it('keeps the transparency of the master and puts the link preview on white, never on black', async () => {
    const transparent = await makeImage({ width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    const out = outputs()
    await renderPhoto(await source(transparent), out, testImagingConfig)

    expect((await meta(out.master)).hasAlpha).toBe(true)
    expect((await meta(out.renditions[480])).hasAlpha).toBe(true)
    expect((await meta(out.share)).hasAlpha).toBe(false)
    const { data } = await sharp(out.share).raw().toBuffer({ resolveWithObject: true })
    expect(Math.min(data[0], data[1], data[2])).toBeGreaterThan(240)
  })

  it('does not clip a 16-bit grey scan to white', async () => {
    const grey16 = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .toColourspace('grey16')
      .png()
      .toBuffer()
    // Fail loudly if the fixture is not what it claims to be, instead of passing for the wrong reason.
    expect((await sharp(grey16).metadata()).space).toBe('grey16')

    const out = outputs()
    await renderPhoto(await source(grey16), out, testImagingConfig)

    const { channels } = await sharp(out.master).stats()
    expect(channels[0].mean).toBeGreaterThan(110)
    expect(channels[0].mean).toBeLessThan(150)
  })

  it('converts a CMYK photo to sRGB instead of tagging RGB data with a CMYK profile', async () => {
    const cmyk = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc3322' } })
      .toColourspace('cmyk')
      .jpeg()
      .toBuffer()
    expect((await sharp(cmyk).metadata()).space).toBe('cmyk')

    const out = outputs()
    await renderPhoto(await source(cmyk, 'in.jpg'), out, testImagingConfig)

    const master = await meta(out.master)
    expect(master.space).toBe('srgb')
    expect(master.channels).toBe(3)
  })

  it('keeps the colour profile of an sRGB-tagged photo, as the Python worker did', async () => {
    const p3 = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
      .withIccProfile('p3')
      .png()
      .toBuffer()
    const out = outputs()
    await renderPhoto(await source(p3), out, testImagingConfig)

    expect((await meta(out.master)).icc).toBeDefined()
  })

  it('declares the pixel limit the Python worker had: a 120 MB TIFF passes, a decompression bomb does not', async () => {
    const { PIXEL_LIMIT } = await import('./imaging')
    expect(PIXEL_LIMIT).toBe(300_000_000)
  })

  it('fails with a message on a file that is not an image', async () => {
    const out = outputs()
    await expect(renderPhoto(await source(Buffer.from('not an image'), 'in.jpg'), out, testImagingConfig)).rejects.toThrow()
  })
})

describe('cutRenditions', () => {
  it('cuts the three widths from an existing master, never enlarging a small one', async () => {
    const master = join(dir, 'master.avif')
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#336699' } }).avif({ quality: 65, effort: 0 }).toFile(master)
    const paths = { 480: join(dir, 'a.avif'), 960: join(dir, 'b.avif'), 1600: join(dir, 'c.avif') }

    const size = await cutRenditions(master, paths, testImagingConfig)

    expect(size).toEqual({ width: 2400, height: 1600 })
    expect(await meta(paths[480])).toMatchObject({ width: 480, height: 320 })
    expect(await meta(paths[960])).toMatchObject({ width: 960, height: 640 })
    expect(await meta(paths[1600])).toMatchObject({ width: 1600, height: 1067 })
  })
})
```

```ts
// worker/heic.test.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeHeic, isHeicKey } from './heic'

describe('isHeicKey', () => {
  it.each(['private/route-photos/r/u.heic', 'private/route-photos/r/IMG_1.HEIC', 'private/bike-model-photos/m/u.heif'])(
    '%s is HEIC',
    (key) => expect(isHeicKey(key)).toBe(true),
  )
  it.each(['private/route-photos/r/u.jpg', 'private/route-photos/r/u.png', 'private/route-photos/r/heic'])(
    '%s is not',
    (key) => expect(isHeicKey(key)).toBe(false),
  )
})

describe('decodeHeic', () => {
  it('decodes a HEIC file to raw RGBA pixels', async () => {
    const file = await readFile(join(__dirname, 'fixtures', 'sample.heic'))
    const image = await decodeHeic(file)
    expect(image.width).toBe(640)
    expect(image.height).toBe(480)
    expect(image.data.length).toBe(640 * 480 * 4)
  })

  it('rejects bytes that are not a HEIC file', async () => {
    await expect(decodeHeic(Buffer.from('not heic at all'))).rejects.toThrow()
  })
})
```

Aggiungere in `worker/heic.test.ts` anche l'integrazione con `renderPhoto` (la foto HEIC arriva al master):

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { renderPhoto } from './imaging'
import { testImagingConfig } from './testing/images'

describe('a HEIC photo through renderPhoto', () => {
  it('ends as a master of its own size, and the other outputs exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'heic-'))
    try {
      const raw = await decodeHeic(await readFile(join(__dirname, 'fixtures', 'sample.heic')))
      const out = {
        master: join(dir, 'master.avif'),
        share: join(dir, 'share.jpg'),
        renditions: { 480: join(dir, 'a.avif'), 960: join(dir, 'b.avif'), 1600: join(dir, 'c.avif') },
      }
      expect(await renderPhoto(raw, out, testImagingConfig)).toEqual({ width: 640, height: 480 })
      expect(await sharp(out.master).metadata()).toMatchObject({ width: 640, height: 480 })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Passo 3: vederli fallire**

Run: `npx vitest run worker/imaging.test.ts worker/heic.test.ts`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 4: scrivere i moduli**

```ts
// worker/imaging.ts
import sharp from 'sharp'
import { RENDITION_WIDTHS } from '@/lib/media/keys'
import type { ImagingConfig } from './config'

/**
 * Photo processing: any accepted source in, one AVIF master out, plus the link preview and the renditions.
 *
 * The source is decoded once, fitted and oriented, and held as a lossless intermediate in memory; every output is cut
 * from that, never from the source again (a second decode of a 120 MB TIFF) and never through a lossy step.
 */

/** Pillow refused anything above ~89 MP; a 120 MB manufacturer TIFF needs more, and a decompression bomb still fails. */
export const PIXEL_LIMIT = 300_000_000

/** Decoded pixels (HEIC goes this way), handed to sharp as raw RGBA. */
export interface RawImage {
  data: Buffer
  width: number
  height: number
}

export interface PhotoOutputs {
  master: string
  share: string
  /** width → path, one for every width in RENDITION_WIDTHS */
  renditions: Record<number, string>
}

function open(source: string | RawImage): sharp.Sharp {
  if (typeof source === 'string') return sharp(source, { limitInputPixels: PIXEL_LIMIT, failOn: 'error' })
  return sharp(source.data, {
    raw: { width: source.width, height: source.height, channels: 4 },
    limitInputPixels: PIXEL_LIMIT,
  })
}

export async function renderPhoto(
  source: string | RawImage,
  outputs: PhotoOutputs,
  config: ImagingConfig,
): Promise<{ width: number; height: number }> {
  const input = open(source)
  const { space } = await input.metadata()

  // A profile describes RGB data. It travels with data that stays RGB (sRGB-tagged photos, wide-gamut phones); anything
  // else (CMYK, greyscale, 16-bit) is converted to sRGB first, because a CMYK profile on RGB pixels would be wrong.
  const staysRgb = space === 'srgb'
  const oriented = input.rotate()
  const prepared = staysRgb ? oriented.keepIccProfile() : oriented.toColourspace('srgb')

  const { data: intermediate, info } = await prepared
    .resize({ width: config.maxEdge, height: config.maxEdge, fit: 'inside', withoutEnlargement: true })
    .tiff({ compression: 'lzw' })
    .toBuffer({ resolveWithObject: true })

  const avif = (width?: number) => {
    const image = sharp(intermediate).keepIccProfile()
    return (width ? image.resize({ width, withoutEnlargement: true }) : image).avif({
      quality: config.quality,
      effort: config.effort,
    })
  }

  await avif().toFile(outputs.master)
  for (const width of RENDITION_WIDTHS) await avif(width).toFile(outputs.renditions[width])
  await sharp(intermediate)
    .keepIccProfile()
    .resize({ width: config.shareEdge, height: config.shareEdge, fit: 'inside', withoutEnlargement: true })
    // JPEG has no alpha: a transparent background would turn black.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: config.shareQuality })
    .toFile(outputs.share)

  return { width: info.width, height: info.height }
}

/** Cut the renditions from an already written master (the backfill and "reprocess"). Returns the master's size. */
export async function cutRenditions(
  masterPath: string,
  paths: Record<number, string>,
  config: ImagingConfig,
): Promise<{ width: number; height: number }> {
  const { width = 0, height = 0 } = await sharp(masterPath).metadata()
  for (const target of RENDITION_WIDTHS) {
    await sharp(masterPath)
      .keepIccProfile()
      .resize({ width: target, withoutEnlargement: true })
      .avif({ quality: config.quality, effort: config.effort })
      .toFile(paths[target])
  }
  return { width, height }
}
```

```ts
// worker/types/libheif-js.d.ts
declare module 'libheif-js'
```

```ts
// worker/heic.ts
import { createRequire } from 'node:module'
import { extensionOf } from '@/lib/media/keys'
import type { RawImage } from './imaging'

/**
 * HEIC, what an iPhone produces. The precompiled sharp cannot decode its HEVC video codec (patents), so the file is
 * decoded here, with libheif compiled to WebAssembly, and handed to sharp as raw pixels. libheif applies the rotation
 * the file asks for, so a portrait shot arrives upright.
 */

const require = createRequire(import.meta.url)

interface HeifImage {
  get_width(): number
  get_height(): number
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void
}
interface Libheif {
  HeifDecoder: new () => { decode(file: Buffer): HeifImage[] }
}

let libheif: Libheif | undefined
export function loadLibheif(): Libheif {
  return (libheif ??= require('libheif-js') as Libheif)
}

export function isHeicKey(key: string): boolean {
  const ext = extensionOf(key)
  return ext === 'heic' || ext === 'heif'
}

export async function decodeHeic(file: Buffer): Promise<RawImage> {
  const [image] = new (loadLibheif().HeifDecoder)().decode(file)
  if (!image) throw new Error('The HEIC file holds no image')

  const width = image.get_width()
  const height = image.get_height()
  const rgba = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) => {
    image.display({ data: rgba, width, height }, (result) =>
      result ? resolve() : reject(new Error('libheif could not decode the image')),
    )
  })
  return { data: Buffer.from(rgba.buffer), width, height }
}
```

- [ ] **Passo 5: far passare**

Run: `npx vitest run worker/imaging.test.ts worker/heic.test.ts`
Atteso: PASS. Se «keeps the colour profile» o «16-bit» falliscono, **non indebolire il test**: vuol dire che la versione di `sharp` non si comporta come Pillow su quel punto; annotarlo in `docs/ai/ideas/heic-decode-spike.md` (sezione «Differenze da Pillow») e decidere con Kevin.

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 6: commit**

```bash
git add worker/imaging.ts worker/heic.ts worker/types worker/testing/images.ts worker/*.test.ts
git commit -m "Process photos with sharp, HEIC through libheif"
```

- [ ] **Passo 7 (solo se la decisione del compito 1 è «percorso B»): variante B**

Sostituire `worker/heic.ts` così: `decodeHeic` non serve più, perché `sharp` costruito contro `libvips` di sistema (con `libheif` e `libde265`) legge i HEIC da solo. `isHeicKey` resta (per i log). In `worker/jobs/photo.ts` (compito 8) si passa sempre il percorso del file a `renderPhoto`. `Dockerfile.worker` (compito 12) installa `libvips-dev` e costruisce `sharp` dal sorgente: nello stadio `runner`, prima di `npm install`, aggiungere `RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 pkg-config libvips-dev && rm -rf /var/lib/apt/lists/*` e lanciare `SHARP_FORCE_GLOBAL_LIBVIPS=1 npm install --omit=dev --no-audit --no-fund`. Il test `worker/heic.test.ts` diventa: `sharp('worker/fixtures/sample.heic').metadata()` ha larghezza 640.

---

### Compito 8: I lavori sulle foto (`worker/jobs/photo.ts`, `worker/jobs/renditions.ts`)

**File:**
- Crea: `worker/jobs/photo.ts`, `worker/jobs/renditions.ts`
- Test: `worker/jobs/photo.test.ts`, `worker/jobs/renditions.test.ts`

**Interfacce:**
- Consuma: `ObjectStore`, `MissingObjectError`, `MediaJob`, `progressReporter`, `sha256OfFile`, `renderPhoto`, `cutRenditions`, `decodeHeic`, `isHeicKey`, `WorkerConfig`, `Logger`, `MediaJobData`, `photoMasterKeyFor`, `photoShareKey`, `photoRenditionKey`, `isMasterKey`, `RENDITION_WIDTHS`.
- Produce:
  `interface JobDeps { store: ObjectStore; config: WorkerConfig; log: Logger }` (in `worker/jobs/types.ts`),
  `MASTER_CACHE_CONTROL`, `createPhotoHandler(deps: JobDeps): (job: MediaJob) => Promise<PhotoResult>`,
  `type PhotoResult = { width?: number; height?: number; sha256?: string; skipped?: boolean }`,
  `createRenditionsHandler(deps: JobDeps): (job: MediaJob) => Promise<{ width: number; height: number }>`.

- [ ] **Passo 1: estendere `worker/jobs/types.ts`**

Aggiungere in fondo al file:

```ts
import type { WorkerConfig } from '../config'
import type { Logger } from '../logger'
import type { ObjectStore } from '../storage'

/** What every job handler needs; tests pass a folder-backed store and a quiet logger. */
export interface JobDeps {
  store: ObjectStore
  config: WorkerConfig
  log: Logger
}
```

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// worker/jobs/photo.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobProgress } from '@/lib/queues/schemas'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { makeImage } from '../testing/images'
import { MissingObjectError } from '../storage'
import { createPhotoHandler } from './photo'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'photo-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'photo-work-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(workdir, { recursive: true, force: true })
})

const config = () =>
  loadConfig({
    APP_ENV: 'staging', REDIS_URL: 'redis://x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
  })
const quiet = pino({ level: 'silent' })

async function stage(key: string, content: Buffer) {
  const file = join(root, 'b', ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

function jobFor(key: string, attemptsMade = 0) {
  const progress: object[] = []
  const job: MediaJob = {
    data: { bucket: 'b', key },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: vi.fn(async (value: object) => { progress.push(value) }),
  }
  return { job, progress }
}

const KEY = 'private/route-photos/r1/u1.PNG'

describe('the photo handler', () => {
  it('turns a staged photo into a master, a link preview and three renditions, master last, then deletes the source', async () => {
    await stage(KEY, await makeImage({ width: 3000, height: 2000 }))
    const store = dirStore(root)
    const { job, progress } = jobFor(KEY)

    const result = await createPhotoHandler({ store, config: config(), log: quiet })(job)

    expect(store.uploads.map((u) => u.key)).toEqual([
      'public/route-photos/r1/u1.share.jpg',
      'public/route-photos/r1/u1.w1600.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w480.avif',
      'public/route-photos/r1/u1.avif', // the master goes last: its existence means "done"
    ])
    expect(store.uploads[0]).toMatchObject({ contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' })
    expect(store.uploads[4]).toMatchObject({ contentType: 'image/avif', cacheControl: 'public, max-age=31536000, immutable' })
    expect(await store.exists('b', KEY)).toBe(false)
    expect(store.removed).toEqual([`b/${KEY}`])
    expect(result).toMatchObject({ width: 2400, height: 1600 })
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(progress.map((p) => (p as { phase: string }).phase)).toEqual(['downloading', 'transcoding', 'uploading', 'done'])
    for (const p of progress) expect(JobProgress.safeParse(p).success).toBe(true)
  })

  it('names the attempt it is on', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const { job, progress } = jobFor(KEY, 1)
    await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(job)
    expect(progress[0]).toMatchObject({ attempt: 2 })
  })

  it('does not delete the source when something goes wrong before everything is uploaded', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const store = dirStore(root)
    const realUpload = store.upload
    store.upload = vi.fn(async (bucket, key, src, options) => {
      if (key.endsWith('u1.avif')) throw new Error('R2 hiccup') // the master, the last upload
      return realUpload(bucket, key, src, options)
    })

    await expect(createPhotoHandler({ store, config: config(), log: quiet })(jobFor(KEY).job)).rejects.toThrow('R2 hiccup')

    expect(await store.exists('b', KEY)).toBe(true)
    expect(store.removed).toEqual([])
  })

  it('treats a job whose source is already gone but whose master is there as done, without failing', async () => {
    await stage('public/route-photos/r1/u1.avif', Buffer.from('already processed'))
    const result = await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)
    expect(result).toEqual({ skipped: true })
  })

  it('fails with MissingObjectError when there is neither source nor master', async () => {
    await expect(createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)).rejects.toBeInstanceOf(MissingObjectError)
  })

  it('removes a working folder left behind by an attempt that was killed, and its own when it ends', async () => {
    await stage(KEY, await makeImage({ width: 100, height: 100 }))
    const stale = join(workdir, 'b', KEY.replaceAll('/', '_'))
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'leftover'), 'x')

    await createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(KEY).job)

    const { readdir } = await import('node:fs/promises')
    expect(await readdir(join(workdir, 'b')).catch(() => [])).toEqual([])
  })

  it('refuses a job whose data is not a bucket and a key', async () => {
    const job: MediaJob = { data: { nope: 1 }, attemptsMade: 0, opts: {}, updateProgress: async () => {} }
    await expect(createPhotoHandler({ store: dirStore(root), config: config(), log: quiet })(job)).rejects.toThrow()
  })
})
```

```ts
// worker/jobs/renditions.test.ts
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { createRenditionsHandler } from './renditions'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rend-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'rend-work-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(workdir, { recursive: true, force: true })
})

const config = () =>
  loadConfig({
    APP_ENV: 'staging', REDIS_URL: 'redis://x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
  })
const quiet = pino({ level: 'silent' })
const jobFor = (key: string): MediaJob => ({ data: { bucket: 'b', key }, attemptsMade: 0, opts: {}, updateProgress: vi.fn(async () => {}) })

describe('the renditions handler', () => {
  it('cuts the renditions of a master that has none, from the largest to the smallest', async () => {
    const key = 'public/route-photos/r1/u1.avif'
    await mkdir(join(root, 'b', 'public', 'route-photos', 'r1'), { recursive: true })
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#336699' } })
      .avif({ quality: 65, effort: 0 })
      .toFile(join(root, 'b', ...key.split('/')))
    const store = dirStore(root)

    const size = await createRenditionsHandler({ store, config: config(), log: quiet })(jobFor(key))

    expect(size).toEqual({ width: 2400, height: 1600 })
    expect(store.uploads.map((u) => u.key)).toEqual([
      'public/route-photos/r1/u1.w1600.avif',
      'public/route-photos/r1/u1.w960.avif',
      'public/route-photos/r1/u1.w480.avif', // the smallest last: its existence means they all exist
    ])
    expect(store.removed).toEqual([]) // it only ever adds objects
  })

  it('refuses anything that is not a master, whatever ends up in its queue', async () => {
    for (const key of ['public/route-photos/r1/u1.w480.avif', 'public/route-photos/r1/u1.share.jpg', 'private/route-photos/r1/u1.jpg']) {
      await expect(createRenditionsHandler({ store: dirStore(root), config: config(), log: quiet })(jobFor(key))).rejects.toThrow(/not a master/)
    }
  })
})
```

- [ ] **Passo 3: vederli fallire**

Run: `npx vitest run worker/jobs`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 4: scrivere i due lavori**

```ts
// worker/jobs/photo.ts
import { mkdir, readFile, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { RENDITION_WIDTHS, photoMasterKeyFor, photoRenditionKey, photoShareKey } from '@/lib/media/keys'
import { MediaJobData } from '@/lib/queues/schemas'
import { sha256OfFile } from '../hash'
import { decodeHeic, isHeicKey } from '../heic'
import { renderPhoto, type PhotoOutputs } from '../imaging'
import { progressReporter } from '../progress'
import { MissingObjectError } from '../storage'
import type { JobDeps, MediaJob } from './types'

/**
 * The output name carries the source's uuid, which never repeats, so a browser or CDN may keep the file for as long as
 * it likes.
 */
export const MASTER_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export interface PhotoResult {
  width?: number
  height?: number
  sha256?: string
  /** The source was already gone and the master was there: someone else finished this job. */
  skipped?: boolean
}

/**
 * Photo processing: any accepted upload in, one AVIF master out. Upload order matters: link preview, renditions from the
 * largest to the smallest, then the master, whose presence marks the photo as done. The source goes only after all of
 * that, so a failure before then leaves it where the next attempt (or scan) finds it.
 */
export function createPhotoHandler({ store, config, log }: JobDeps) {
  return async function processPhoto(job: MediaJob): Promise<PhotoResult> {
    const { bucket, key } = MediaJobData.parse(job.data)
    const attempt = job.attemptsMade + 1
    const report = progressReporter(job, attempt)
    const masterKey = photoMasterKeyFor(key)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const source = join(workdir, 'input' + extname(key))
    const outputs: PhotoOutputs = {
      master: join(workdir, 'master.avif'),
      share: join(workdir, 'share.jpg'),
      renditions: Object.fromEntries(RENDITION_WIDTHS.map((width) => [width, join(workdir, `w${width}.avif`)])),
    }

    // A folder left by an attempt that was killed must not leak into this one.
    await rm(workdir, { recursive: true, force: true })
    await mkdir(workdir, { recursive: true })

    try {
      await report('downloading')
      log.info({ bucket, key, attempt }, 'photo: downloading')
      try {
        await store.download(bucket, key, source)
      } catch (err) {
        if (err instanceof MissingObjectError && (await store.exists(bucket, masterKey))) {
          log.info({ bucket, key }, 'photo: source already processed')
          return { skipped: true }
        }
        throw err
      }

      // The only place the source exists outside R2 is here, and it is deleted below.
      const sha256 = await sha256OfFile(source)

      await report('transcoding')
      const image = isHeicKey(key) ? await decodeHeic(await readFile(source)) : source
      const { width, height } = await renderPhoto(image, outputs, config.imaging)
      log.info({ bucket, key, width, height }, 'photo: rendered')

      await report('uploading', { percent: 99 })
      const options = { contentType: 'image/avif', cacheControl: MASTER_CACHE_CONTROL }
      await store.upload(bucket, photoShareKey(key), outputs.share, { contentType: 'image/jpeg', cacheControl: MASTER_CACHE_CONTROL })
      for (const rendition of [...RENDITION_WIDTHS].sort((a, b) => b - a)) {
        await store.upload(bucket, photoRenditionKey(masterKey, rendition), outputs.renditions[rendition], options)
      }
      await store.upload(bucket, masterKey, outputs.master, options)

      await store.remove(bucket, key)
      await report('done', { percent: 100, sha256 })
      log.info({ bucket, masterKey }, 'photo: done')
      return { width, height, sha256 }
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
```

```ts
// worker/jobs/renditions.ts
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { RENDITION_WIDTHS, isMasterKey, photoRenditionKey } from '@/lib/media/keys'
import { MediaJobData } from '@/lib/queues/schemas'
import { cutRenditions } from '../imaging'
import { MASTER_CACHE_CONTROL } from './photo'
import type { JobDeps, MediaJob } from './types'

/**
 * Backfill: responsive renditions for masters that were produced without them (and, later, "reprocess" for a photo).
 * The sources of those masters are long deleted, so the renditions are cut from the master itself. It only ever adds
 * objects: it never deletes, and it never touches anything that is not a master.
 */
export function createRenditionsHandler({ store, config, log }: JobDeps) {
  return async function renderRenditions(job: MediaJob): Promise<{ width: number; height: number }> {
    const { bucket, key } = MediaJobData.parse(job.data)
    // Checked before anything is read or written, whatever ends up in this queue.
    if (!isMasterKey(key)) throw new Error(`not a master: ${key}`)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const master = join(workdir, 'master.avif')
    const paths = Object.fromEntries(RENDITION_WIDTHS.map((width) => [width, join(workdir, `w${width}.avif`)]))

    await rm(workdir, { recursive: true, force: true })
    await mkdir(workdir, { recursive: true })
    try {
      log.info({ bucket, key }, 'renditions: downloading master')
      await store.download(bucket, key, master)
      const size = await cutRenditions(master, paths, config.imaging)

      // Largest first: the smallest goes up last, and its presence marks the job as done.
      for (const width of [...RENDITION_WIDTHS].sort((a, b) => b - a)) {
        await store.upload(bucket, photoRenditionKey(key, width), paths[width], {
          contentType: 'image/avif',
          cacheControl: MASTER_CACHE_CONTROL,
        })
      }
      log.info({ bucket, key }, 'renditions: done')
      return size
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
```

- [ ] **Passo 5: far passare**

Run: `npx vitest run worker/jobs`
Atteso: PASS.

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 6: commit**

```bash
git add worker/jobs
git commit -m "Add the photo and renditions jobs"
```

---

### Compito 9: Il lavoro sui video (`worker/jobs/video.ts`)

Gli argomenti di ffmpeg sono una scelta misurata e non si toccano: un file «golden» generato dal worker Python prova che sono identici. Cambia solo chi lancia ffmpeg.

**File:**
- Crea: `worker/jobs/video.ts`, `worker/testing/ffmpeg.ts`, `worker/scripts/make-ffmpeg-golden.py`, `worker/fixtures/ffmpeg-args.golden.json` (generato)
- Test: `worker/jobs/video.test.ts`, `worker/jobs/video.integration.test.ts`

**Interfacce:**
- Consuma: `ObjectStore`, `MissingObjectError`, `MediaJob`, `progressReporter`, `sha256OfFile`, `JobDeps`, `MediaJobData`, `deriveHlsPrefix`, `HLS_MANIFESTS`.
- Produce:
  `RENDITIONS`, `SEGMENT_SECONDS`, `MASTER_MANIFEST`, `LEGACY_MANIFEST`,
  `buildFfmpegArgs(src: string, hlsDir: string, options?: { audio?: boolean }): string[]` (il primo elemento è `'ffmpeg'`; `audio` vale `true` per default e dà gli stessi argomenti del file «golden»),
  `probeHasAudio(path: string): Promise<boolean>`,
  `parseOutTimeUs(line: string): number | null`,
  `ffmpegCommand(args: string[], platform?: NodeJS.Platform): { command: string; args: string[] }`,
  `probeDuration(path: string): Promise<number>`,
  `runFfmpeg(args: string[], durationS: number, onPercent: (percent: number) => Promise<void>): Promise<void>`,
  `uploadTree(store: ObjectStore, bucket: string, prefix: string, hlsDir: string, concurrency?: number): Promise<number>`,
  `createVideoHandler(deps: JobDeps): (job: MediaJob) => Promise<{ files?: number; sha256?: string; skipped?: boolean }>`;
  nei test: `hasFfmpeg(): boolean`, `makeClip(path: string, options?: { audio?: boolean; seconds?: number }): Promise<void>`.

- [ ] **Passo 1: generare il file «golden» dal worker Python**

```python
# worker/scripts/make-ffmpeg-golden.py
"""
Writes worker/fixtures/ffmpeg-args.golden.json from the Python worker's own ffmpeg_args().

    gh repo clone lelettricaleoni/videoStream-bucketWorker "$TEMP/old-worker"
    python worker/scripts/make-ffmpeg-golden.py "$TEMP/old-worker/jobs/transcode.py"

Only the constants and the function are executed (read out of the file with `ast`), so the Python worker's own
dependencies (bullmq, boto3) need not be installed.
"""
import ast
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text()
wanted = {"RENDITIONS", "SEGMENT_SECONDS", "MASTER_MANIFEST"}
body = []
for node in ast.parse(source).body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", None) in wanted for t in node.targets):
        body.append(node)
    if isinstance(node, ast.FunctionDef) and node.name == "ffmpeg_args":
        body.append(node)

namespace: dict = {}
exec(compile(ast.Module(body=body, type_ignores=[]), "transcode", "exec"), namespace)
args = namespace["ffmpeg_args"]("/work/input.mp4", "/work/hls")

target = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "ffmpeg-args.golden.json"
target.write_text(json.dumps(args, indent=2) + "\n")
print(len(args), "arguments written to", target)
```

```bash
gh repo clone lelettricaleoni/videoStream-bucketWorker "$TEMP/old-worker"
python worker/scripts/make-ffmpeg-golden.py "$TEMP/old-worker/jobs/transcode.py"
```
Atteso: `N arguments written to …/worker/fixtures/ffmpeg-args.golden.json` (N intorno a 90).

- [ ] **Passo 2: gli aiuti per i test**

```ts
// worker/testing/ffmpeg.ts
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function hasFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
}

/** A short test-pattern clip, with or without a sound track (a silent clip is a case worth testing). */
export async function makeClip(path: string, { audio = true, seconds = 2 }: { audio?: boolean; seconds?: number } = {}): Promise<void> {
  const args = ['-y', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=640x360:rate=25`]
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`)
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p')
  if (audio) args.push('-c:a', 'aac', '-shortest')
  args.push(path)
  await run('ffmpeg', args)
}
```

- [ ] **Passo 3: scrivere i test che falliscono**

```ts
// worker/jobs/video.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dirStore } from '../testing/dir-store'
import { MASTER_MANIFEST, RENDITIONS, SEGMENT_SECONDS, buildFfmpegArgs, ffmpegCommand, parseOutTimeUs, uploadTree } from './video'

describe('the ladder', () => {
  it('is the one that was measured, rung for rung', () => {
    expect(RENDITIONS.map((r) => [r.label, r.width, r.height, r.videoBitrate, r.maxBitrate, r.audioBitrate])).toEqual([
      ['1080p', 1920, 1080, '3500k', '3850k', '128k'],
      ['720p', 1280, 720, '1800k', '1980k', '128k'],
      ['480p', 854, 480, '1000k', '1100k', '96k'],
      ['360p', 640, 360, '550k', '605k', '64k'],
    ])
    expect(SEGMENT_SECONDS).toBe(4)
    expect(MASTER_MANIFEST).toBe('master.m3u8')
  })
})

describe('buildFfmpegArgs', () => {
  it('asks ffmpeg exactly what the Python worker asked', async () => {
    const golden = JSON.parse(await readFile(join(__dirname, '..', 'fixtures', 'ffmpeg-args.golden.json'), 'utf8')) as string[]
    expect(buildFfmpegArgs('/work/input.mp4', '/work/hls')).toEqual(golden)
  })

  it('asks for the audio as optional by default', () => {
    expect(buildFfmpegArgs('in.mp4', 'out')).toContain('0:a?')
  })

  it('leaves the audio out of the maps when the source has none: ffmpeg refuses a stream map that names a track that is not there', () => {
    const args = buildFfmpegArgs('in.mp4', 'out', { audio: false })
    expect(args).not.toContain('0:a?')
    expect(args.some((arg) => arg.startsWith('-c:a:'))).toBe(false)
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe('v:0,name:1080p v:1,name:720p v:2,name:480p v:3,name:360p')
  })
})

describe('parseOutTimeUs', () => {
  it('reads the progress line ffmpeg prints on stdout', () => {
    expect(parseOutTimeUs('out_time_us=4500000')).toBe(4_500_000)
  })
  it('ignores every other line', () => {
    expect(parseOutTimeUs('frame=120')).toBeNull()
    expect(parseOutTimeUs('out_time=00:00:04.50')).toBeNull()
    expect(parseOutTimeUs('')).toBeNull()
  })
})

describe('ffmpegCommand', () => {
  it('runs ffmpeg at a lower priority on Linux, so a transcode never slows the site', () => {
    expect(ffmpegCommand(['ffmpeg', '-i', 'a'], 'linux')).toEqual({ command: 'nice', args: ['-n', '10', 'ffmpeg', '-i', 'a'] })
  })
  it('runs it plainly elsewhere', () => {
    expect(ffmpegCommand(['ffmpeg', '-i', 'a'], 'win32')).toEqual({ command: 'ffmpeg', args: ['-i', 'a'] })
  })
})

describe('uploadTree', () => {
  let root: string
  let hls: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tree-store-'))
    hls = await mkdtemp(join(tmpdir(), 'tree-hls-'))
    for (const file of [
      'master.m3u8', '1080p/playlist.m3u8', '1080p/seg000.ts', '1080p/seg001.ts', '360p/playlist.m3u8', '360p/seg000.ts',
    ]) {
      await mkdir(join(hls, file, '..'), { recursive: true })
      await writeFile(join(hls, file), file)
    }
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(hls, { recursive: true, force: true })
  })

  it('uploads the segments, then the playlists of the rungs, then the master manifest last', async () => {
    const store = dirStore(root)
    const count = await uploadTree(store, 'b', 'public/route-videos/r/u/', hls)

    expect(count).toBe(6)
    const keys = store.uploads.map((u) => u.key)
    expect(keys[keys.length - 1]).toBe('public/route-videos/r/u/master.m3u8')
    const lastSegment = Math.max(...keys.map((k, i) => (k.endsWith('.ts') ? i : -1)))
    const firstPlaylist = Math.min(...keys.map((k, i) => (k.endsWith('playlist.m3u8') ? i : Infinity)))
    expect(lastSegment).toBeLessThan(firstPlaylist)
  })

  it('gives each file its content type', async () => {
    const store = dirStore(root)
    await uploadTree(store, 'b', 'p/', hls)
    const type = (suffix: string) => store.uploads.find((u) => u.key.endsWith(suffix))?.contentType
    expect(type('.ts')).toBe('video/mp2t')
    expect(type('master.m3u8')).toBe('application/vnd.apple.mpegurl')
    expect(type('360p/playlist.m3u8')).toBe('application/vnd.apple.mpegurl')
  })
})
```

```ts
// worker/jobs/video.integration.test.ts
// Needs ffmpeg and ffprobe. Skipped where they are not installed; CI installs them.
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config'
import { dirStore } from '../testing/dir-store'
import { hasFfmpeg, makeClip } from '../testing/ffmpeg'
import { createVideoHandler } from './video'
import type { MediaJob } from './types'

let root: string
let workdir: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'video-store-'))
  workdir = await mkdtemp(join(tmpdir(), 'video-work-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(workdir, { recursive: true, force: true })
})

const config = () =>
  loadConfig({
    APP_ENV: 'staging', REDIS_URL: 'redis://x', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
  })
const quiet = pino({ level: 'silent' })

describe.skipIf(!hasFfmpeg())('the video handler, with the real ffmpeg', () => {
  for (const audio of [true, false]) {
    it(`makes the four rungs and a master manifest from a clip ${audio ? 'with' : 'without'} sound, then deletes the source`, async () => {
      const key = 'private/route-videos/r1/u1.MP4'
      await mkdir(join(root, 'b', 'private', 'route-videos', 'r1'), { recursive: true })
      await makeClip(join(root, 'b', ...key.split('/')), { audio })
      const store = dirStore(root)
      const progress: { phase: string; percent?: number }[] = []
      const job: MediaJob = {
        data: { bucket: 'b', key },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: vi.fn(async (value: object) => { progress.push(value as { phase: string }) }),
      }

      const result = await createVideoHandler({ store, config: config(), log: quiet })(job)

      const keys = store.uploads.map((u) => u.key)
      expect(keys[keys.length - 1]).toBe('public/route-videos/r1/u1/master.m3u8')
      for (const rung of ['1080p', '720p', '480p', '360p']) {
        expect(keys).toContain(`public/route-videos/r1/u1/${rung}/playlist.m3u8`)
        expect(keys.some((k) => k.startsWith(`public/route-videos/r1/u1/${rung}/seg`))).toBe(true)
      }
      const master = await readFile(join(root, 'b', 'public', 'route-videos', 'r1', 'u1', 'master.m3u8'), 'utf8')
      expect(master.match(/#EXT-X-STREAM-INF/g)).toHaveLength(4)
      expect(await store.exists('b', key)).toBe(false)
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(progress.map((p) => p.phase)[0]).toBe('downloading')
      expect(progress[progress.length - 1]).toMatchObject({ phase: 'done', percent: 100 })
    }, 180_000)
  }

  it('treats a video whose source is already gone but whose stream is there as done', async () => {
    await mkdir(join(root, 'b', 'public', 'route-videos', 'r1', 'u1'), { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'b', 'public', 'route-videos', 'r1', 'u1', 'master.m3u8'), '#EXTM3U')
    const job: MediaJob = { data: { bucket: 'b', key: 'private/route-videos/r1/u1.mp4' }, attemptsMade: 0, opts: {}, updateProgress: async () => {} }

    expect(await createVideoHandler({ store: dirStore(root), config: config(), log: quiet })(job)).toEqual({ skipped: true })
  })
})
```

- [ ] **Passo 4: vederli fallire**

Run: `npx vitest run worker/jobs/video.test.ts`
Atteso: FAIL, `./video` non trovato.

- [ ] **Passo 5: scrivere `worker/jobs/video.ts`**

```ts
// worker/jobs/video.ts
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline'
import pLimit from 'p-limit'
import { HLS_MANIFESTS, deriveHlsPrefix } from '@/lib/media/keys'
import { MediaJobData } from '@/lib/queues/schemas'
import { sha256OfFile } from '../hash'
import { progressReporter } from '../progress'
import { MissingObjectError, type ObjectStore } from '../storage'
import type { JobDeps, MediaJob } from './types'

/**
 * Video transcoding: any common video in, adaptive-bitrate HLS out.
 *
 * **The ladder is priced in bitrate, not in quality.** Constant quality (`-crf` under a `-maxrate` ceiling) was measured
 * against these settings on a real 94.5 s trail video and rejected: matched on VMAF it came out about 5% smaller, spread
 * evenly over every rung, so it buys a little storage and nothing for the viewer this ladder exists for, and it makes each
 * rung's advertised bandwidth a property of the footage, which is the number a player trusts to decide whether the rung
 * below will fit. These numbers are the ones measured; do not change them without measuring again.
 */

export const MASTER_MANIFEST = HLS_MANIFESTS[0]
export const LEGACY_MANIFEST = HLS_MANIFESTS[1]

/**
 * Segment length. Also the forced keyframe interval: `-hls_time` can only cut at a keyframe, so without one the muxer
 * waits for x264's own idea of a GOP and this becomes a lower bound, not a length.
 */
export const SEGMENT_SECONDS = 4

/**
 * The 360p rung is the floor for a phone on a trail above Dro. Without it the ladder stopped at 480p, which needs a
 * megabit held steadily: below that hls.js has nowhere left to step down to and the video stops instead of degrading.
 */
export const RENDITIONS = [
  { label: '1080p', width: 1920, height: 1080, videoBitrate: '3500k', maxBitrate: '3850k', audioBitrate: '128k' },
  { label: '720p', width: 1280, height: 720, videoBitrate: '1800k', maxBitrate: '1980k', audioBitrate: '128k' },
  { label: '480p', width: 854, height: 480, videoBitrate: '1000k', maxBitrate: '1100k', audioBitrate: '96k' },
  { label: '360p', width: 640, height: 360, videoBitrate: '550k', maxBitrate: '605k', audioBitrate: '64k' },
] as const

/** The arguments of the one ffmpeg call. The first element is the program, as in the golden file. */
export function buildFfmpegArgs(src: string, hlsDir: string, { audio = true }: { audio?: boolean } = {}): string[] {
  const count = RENDITIONS.length
  const filters = ['[0:v]split=' + count + RENDITIONS.map((_, i) => `[v${i}]`).join('')]
  RENDITIONS.forEach((rung, i) => {
    filters.push(
      `[v${i}]scale=w=${rung.width}:h=${rung.height}:force_original_aspect_ratio=decrease,` +
        `scale=trunc(iw/2)*2:trunc(ih/2)*2[s${i}]`,
    )
  })

  const args = ['ffmpeg', '-nostdin', '-i', src, '-filter_complex', filters.join(';')]
  const variantMap: string[] = []
  RENDITIONS.forEach((rung, i) => {
    args.push(
      '-map', `[s${i}]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, rung.videoBitrate,
      // A keyframe on every segment boundary, on the clock rather than on a frame count, so the rungs line up whatever
      // the source frame rate: otherwise they disagree about where a segment ends, which is what a player trips over
      // when it tries to switch down.
      `-force_key_frames:v:${i}`, `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
      // Scene detection would add keyframes the muxer cannot use while costing bits and time.
      `-x264-params:v:${i}`, 'scenecut=0',
      `-maxrate:v:${i}`, rung.maxBitrate,
      `-bufsize:v:${i}`, `${parseInt(rung.maxBitrate, 10) * 2}k`,
      `-preset:v:${i}`, 'medium',
    )
    // A source with no sound track must not name one: ffmpeg refuses the stream map ("a:0" is not there). With audio
    // the arguments are exactly the Python worker's.
    if (audio) args.push('-map', '0:a?', `-c:a:${i}`, 'aac', `-b:a:${i}`, rung.audioBitrate)
    variantMap.push(audio ? `v:${i},a:${i},name:${rung.label}` : `v:${i},name:${rung.label}`)
  })

  args.push(
    '-var_stream_map', variantMap.join(' '),
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/%v/seg%03d.ts`,
    '-master_pl_name', MASTER_MANIFEST,
    // Machine-readable progress on stdout; without -nostats ffmpeg also writes its human-readable bar to stderr.
    '-progress', 'pipe:1', '-nostats',
    '-y', `${hlsDir}/%v/playlist.m3u8`,
  )
  return args
}

const OUT_TIME = /^out_time_us=(\d+)$/

/** Microseconds of video done, from one line of ffmpeg's progress output, or null for any other line. */
export function parseOutTimeUs(line: string): number | null {
  const match = OUT_TIME.exec(line.trim())
  return match ? Number(match[1]) : null
}

/** On Linux ffmpeg runs under `nice`, so a transcode takes whatever CPU the site leaves and never slows a page. */
export function ffmpegCommand(args: string[], platform: NodeJS.Platform = process.platform): { command: string; args: string[] } {
  return platform === 'linux'
    ? { command: 'nice', args: ['-n', '10', ...args] }
    : { command: args[0], args: args.slice(1) }
}

export async function probeDuration(path: string): Promise<number> {
  const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
  await new Promise<void>((resolve) => { child.once('close', () => resolve()); child.once('error', () => resolve()) })
  const seconds = parseFloat(out.trim())
  return Number.isFinite(seconds) ? seconds : 0
}

/** Whether the source has a sound track. */
export async function probeHasAudio(path: string): Promise<boolean> {
  const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
  await new Promise<void>((resolve) => { child.once('close', () => resolve()); child.once('error', () => resolve()) })
  return out.trim().length > 0
}

/** Runs ffmpeg and reports a percentage every five points: enough to animate a bar, few enough to be cheap. */
export async function runFfmpeg(
  args: string[],
  durationS: number,
  onPercent: (percent: number) => Promise<void>,
): Promise<void> {
  const { command, args: rest } = ffmpegCommand(args)
  const child = spawn(command, rest, { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString()).slice(-800) })
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? -1))
  })

  let lastReported = -5
  for await (const line of createInterface({ input: child.stdout })) {
    const micros = parseOutTimeUs(line)
    if (micros === null || durationS <= 0) continue
    const percent = Math.min(99, Math.floor((micros / 1_000_000 / durationS) * 100))
    if (percent >= lastReported + 5) {
      lastReported = percent
      await onPercent(percent)
    }
  }

  const code = await exited
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${stderrTail}`)
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)))
    else found.push(prefix + entry.name)
  }
  return found
}

function contentTypeOf(name: string): string {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  return name.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'
}

/**
 * Upload the ladder, in an order that never lets the site call a video ready too early: segments first (in parallel),
 * then each rung's playlist, then the master manifest, whose presence is what the site and the scan read as "done".
 */
export async function uploadTree(
  store: ObjectStore,
  bucket: string,
  prefix: string,
  hlsDir: string,
  concurrency = 6,
): Promise<number> {
  const files = await listFiles(hlsDir)
  const segments = files.filter((file) => !file.endsWith('.m3u8'))
  const playlists = files.filter((file) => file.endsWith('.m3u8') && file !== MASTER_MANIFEST)
  const masters = files.filter((file) => file === MASTER_MANIFEST)

  const limit = pLimit(concurrency)
  const put = (relative: string) =>
    store.upload(bucket, prefix + relative, join(hlsDir, ...relative.split('/')), { contentType: contentTypeOf(relative) })

  await Promise.all(segments.map((file) => limit(() => put(file))))
  await Promise.all(playlists.map((file) => limit(() => put(file))))
  for (const file of masters) await put(file)
  return files.length
}

export function createVideoHandler({ store, config, log }: JobDeps) {
  return async function transcodeVideo(
    job: MediaJob,
  ): Promise<{ files?: number; sha256?: string; skipped?: boolean }> {
    const { bucket, key } = MediaJobData.parse(job.data)
    const attempt = job.attemptsMade + 1
    const report = progressReporter(job, attempt)
    const prefix = deriveHlsPrefix(key)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const hlsDir = join(workdir, 'hls')
    const source = join(workdir, 'input' + extname(key))

    await rm(workdir, { recursive: true, force: true })
    await mkdir(hlsDir, { recursive: true })

    try {
      await report('downloading')
      log.info({ bucket, key, attempt }, 'video: downloading')
      try {
        await store.download(bucket, key, source)
      } catch (err) {
        if (err instanceof MissingObjectError) {
          const done = await Promise.all(HLS_MANIFESTS.map((name) => store.exists(bucket, prefix + name)))
          if (done.some(Boolean)) {
            log.info({ bucket, key }, 'video: source already transcoded')
            return { skipped: true }
          }
        }
        throw err
      }

      // The only place the source exists outside R2 is here: the site never receives a video, and this copy is deleted
      // below once the transcode has succeeded.
      const sha256 = await sha256OfFile(source)

      const duration = await probeDuration(source)
      const audio = await probeHasAudio(source)
      await report('transcoding', { percent: 0 })
      log.info({ bucket, key, durationS: duration, audio, rungs: RENDITIONS.length }, 'video: transcoding')
      await runFfmpeg(buildFfmpegArgs(source, hlsDir, { audio }), duration, (percent) => report('transcoding', { percent }))

      await report('uploading', { percent: 99 })
      const files = await uploadTree(store, bucket, prefix, hlsDir)
      log.info({ bucket, prefix, files }, 'video: uploaded')

      await store.remove(bucket, key)
      await report('done', { percent: 100, sha256 })
      log.info({ bucket, manifest: prefix + MASTER_MANIFEST }, 'video: done')
      return { files, sha256 }
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
```

- [ ] **Passo 6: far passare**

Run: `npx vitest run worker/jobs/video.test.ts worker/jobs/video.integration.test.ts`
Atteso: PASS. Il test «asks ffmpeg exactly what the Python worker asked» è il vincolo principale: se fallisce, **correggere `buildFfmpegArgs`**, non il file golden. Il test con ffmpeg vero gira solo se `ffmpeg` e `ffprobe` sono installati (altrimenti è saltato, e la CI li installa). Il caso del clip **senza audio** è quello che il worker Python non copriva: qui passa perché la mappa dei flussi nomina solo i flussi che esistono.

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 7: commit**

```bash
git add worker/jobs/video.ts worker/jobs/video*.test.ts worker/testing/ffmpeg.ts worker/scripts/make-ffmpeg-golden.py worker/fixtures/ffmpeg-args.golden.json
git commit -m "Add the video job: the same ffmpeg call, started from Node"
```

---

### Compito 10: La scansione di sicurezza (`worker/scan.ts`)

La verità sta nello storage: un sorgente senza risultato accanto *è* il lavoro da fare. La scansione ricostruisce i lavori mancanti all'avvio e ogni 10 minuti (oggi ogni 30 secondi: i caricamenti partono subito dal sito, la scansione è solo la rete di sicurezza).

**File:**
- Crea: `worker/scan.ts`
- Test: `worker/scan.test.ts`

**Interfacce:**
- Consuma: `ObjectStore`, `Logger`, `addMediaJob`, `QueueKind`, le funzioni di `@/lib/media/keys`.
- Produce:
  `type PendingJob = { kind: QueueKind; bucket: string; key: string }`,
  `findPending(store: ObjectStore, buckets: string[], log: Logger): Promise<PendingJob[]>`,
  `scanOnce(queues: Record<QueueKind, Pick<Queue, 'add'>>, store: ObjectStore, buckets: string[], log: Logger): Promise<number>`,
  `startScanner(run: () => Promise<void>, intervalMs: number, signal: AbortSignal): Promise<void>`.

- [ ] **Passo 1: scrivere il test che fallisce**

```ts
// worker/scan.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Queue } from 'bullmq'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueKind } from '@/lib/queues/names'
import { findPending, scanOnce, startScanner } from './scan'
import type { ObjectStore } from './storage'
import { dirStore } from './testing/dir-store'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'scan-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const quiet = pino({ level: 'silent' })

async function put(key: string, bucket = 'b') {
  const file = join(root, bucket, ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, 'x')
}

describe('findPending', () => {
  it('finds videos in both staging folders that have no stream beside them, whatever the case of the extension', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('private/bike-model-videos/m1/u2.MP4')
    await put('private/route-videos/r1/notes.txt')
    const found = await findPending(dirStore(root), ['b'], quiet)
    expect(found.map((job) => job.key).sort()).toEqual([
      'private/bike-model-videos/m1/u2.MP4',
      'private/route-videos/r1/u1.mp4',
    ])
    expect(found.every((job) => job.kind === 'video')).toBe(true)
  })

  it('skips a video that already has its master manifest, or the flat playlist of the old worker', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('public/route-videos/r1/u1/master.m3u8')
    await put('private/route-videos/r1/u2.mp4')
    await put('public/route-videos/r1/u2/playlist.m3u8')
    expect(await findPending(dirStore(root), ['b'], quiet)).toEqual([])
  })

  it('finds photos without a master, whatever the extension case, and ignores formats it cannot read', async () => {
    await put('private/route-photos/r1/a.jpg')
    await put('private/route-photos/r1/b.HEIC')
    await put('private/route-photos/r1/c.gif')
    await put('private/route-photos/r1/d.png')
    await put('public/route-photos/r1/d.avif')
    const keys = (await findPending(dirStore(root), ['b'], quiet)).map((job) => job.key).sort()
    expect(keys).toEqual(['private/route-photos/r1/a.jpg', 'private/route-photos/r1/b.HEIC'])
  })

  it('finds masters that have no smallest rendition, and ignores renditions and previews', async () => {
    await put('public/route-photos/r1/old.avif')
    await put('public/route-photos/r1/done.avif')
    await put('public/route-photos/r1/done.w480.avif')
    await put('public/route-photos/r1/done.share.jpg')
    expect(await findPending(dirStore(root), ['b'], quiet)).toEqual([
      { kind: 'renditions', bucket: 'b', key: 'public/route-photos/r1/old.avif' },
    ])
  })

  it('looks in every bucket it is given and keeps them apart', async () => {
    await put('private/route-photos/r1/a.jpg', 'one')
    await put('private/route-photos/r1/b.jpg', 'two')
    const found = await findPending(dirStore(root), ['one', 'two'], quiet)
    expect(found.map((job) => `${job.bucket}:${job.key}`).sort()).toEqual([
      'one:private/route-photos/r1/a.jpg',
      'two:private/route-photos/r1/b.jpg',
    ])
  })

  it('does not let a failed listing of one folder hide the others', async () => {
    await put('private/bike-model-videos/m1/u2.mp4')
    const inner = dirStore(root)
    const store: ObjectStore = {
      ...inner,
      list: async (bucket, prefix) => {
        if (prefix === 'private/route-videos/') throw new Error('R2 hiccup')
        return inner.list(bucket, prefix)
      },
    }
    expect((await findPending(store, ['b'], quiet)).map((job) => job.key)).toEqual(['private/bike-model-videos/m1/u2.mp4'])
  })
})

describe('scanOnce', () => {
  it('adds each pending object to the queue of its kind and says how many', async () => {
    await put('private/route-videos/r1/u1.mp4')
    await put('private/route-photos/r1/a.jpg')
    const added: Record<QueueKind, string[]> = { video: [], photo: [], renditions: [] }
    const queueOf = (kind: QueueKind) => ({ add: vi.fn(async (_name: string, _data: unknown, options: { jobId: string }) => { added[kind].push(options.jobId) }) }) as unknown as Pick<Queue, 'add'>

    const count = await scanOnce({ video: queueOf('video'), photo: queueOf('photo'), renditions: queueOf('renditions') }, dirStore(root), ['b'], quiet)

    expect(count).toBe(2)
    expect(added.video).toEqual(['b/private/route-videos/r1/u1.mp4'])
    expect(added.photo).toEqual(['b/private/route-photos/r1/a.jpg'])
    expect(added.renditions).toEqual([])
  })
})

describe('startScanner', () => {
  it('runs at once, then again after each interval, and stops when told to', async () => {
    const controller = new AbortController()
    let runs = 0
    const done = startScanner(async () => { if (++runs === 3) controller.abort() }, 5, controller.signal)
    await done
    expect(runs).toBe(3)
  })

  it('keeps going when a run fails', async () => {
    const controller = new AbortController()
    let runs = 0
    const done = startScanner(async () => {
      if (++runs === 2) controller.abort()
      throw new Error('boom')
    }, 5, controller.signal)
    await done
    expect(runs).toBe(2)
  })
})
```

- [ ] **Passo 2: vederlo fallire**

Run: `npx vitest run worker/scan.test.ts`
Atteso: FAIL, `./scan` non trovato.

- [ ] **Passo 3: scrivere `worker/scan.ts`**

```ts
// worker/scan.ts
import { setTimeout as sleep } from 'node:timers/promises'
import type { Queue } from 'bullmq'
import {
  HLS_MANIFESTS,
  PHOTO_PUBLIC_PREFIXES,
  PHOTO_STAGING_PREFIXES,
  RENDITION_WIDTHS,
  VIDEO_STAGING_PREFIXES,
  deriveHlsPrefix,
  isMasterKey,
  isPhotoSourceKey,
  isVideoSourceKey,
  photoMasterKeyFor,
  photoRenditionKey,
} from '@/lib/media/keys'
import { addMediaJob } from '@/lib/queues/add-job'
import type { QueueKind } from '@/lib/queues/names'
import type { Logger } from './logger'
import type { ObjectStore } from './storage'

/**
 * **The job list is rebuilt, never stored.** A source object with no result beside it *is* the work to do, and that
 * truth lives in the bucket. The site enqueues a job the moment an upload ends; this scan is the safety net that finds
 * whatever that missed (Redis was down, a file arrived another way, the worker was off) and keeps the queue honest after
 * a restart or a rebuilt machine. Redis holds the queue for retries and ordering, not the record of what needs doing.
 */

export interface PendingJob {
  kind: QueueKind
  bucket: string
  key: string
}

/** Uploaded last, so its existence means every rendition exists. */
const MARKER_WIDTH = Math.min(...RENDITION_WIDTHS)

/** One prefix at a time: a failed listing of one must not hide the others. */
async function listOrLog(store: ObjectStore, bucket: string, prefix: string, log: Logger): Promise<string[]> {
  try {
    return await store.list(bucket, prefix)
  } catch (err) {
    log.error({ bucket, prefix, err: err instanceof Error ? err.message : String(err) }, 'scan: listing failed')
    return []
  }
}

async function pendingVideos(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of VIDEO_STAGING_PREFIXES) {
    for (const key of await listOrLog(store, bucket, prefix, log)) {
      if (!isVideoSourceKey(key)) continue
      const streamPrefix = deriveHlsPrefix(key)
      const done = await Promise.all(HLS_MANIFESTS.map((name) => store.exists(bucket, streamPrefix + name)))
      if (!done.some(Boolean)) out.push({ kind: 'video', bucket, key })
    }
  }
  return out
}

async function pendingPhotos(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of PHOTO_STAGING_PREFIXES) {
    for (const key of await listOrLog(store, bucket, prefix, log)) {
      if (isPhotoSourceKey(key) && !(await store.exists(bucket, photoMasterKeyFor(key)))) {
        out.push({ kind: 'photo', bucket, key })
      }
    }
  }
  return out
}

async function pendingRenditions(store: ObjectStore, bucket: string, log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const prefix of PHOTO_PUBLIC_PREFIXES) {
    // The listing already says what exists: no request per master, on a scan that runs for as long as the worker lives.
    const keys = await listOrLog(store, bucket, prefix, log)
    const present = new Set(keys)
    for (const key of keys) {
      if (isMasterKey(key) && !present.has(photoRenditionKey(key, MARKER_WIDTH))) {
        out.push({ kind: 'renditions', bucket, key })
      }
    }
  }
  return out
}

export async function findPending(store: ObjectStore, buckets: string[], log: Logger): Promise<PendingJob[]> {
  const out: PendingJob[] = []
  for (const bucket of buckets) {
    out.push(...(await pendingVideos(store, bucket, log)))
    out.push(...(await pendingPhotos(store, bucket, log)))
    out.push(...(await pendingRenditions(store, bucket, log)))
  }
  return out
}

/** One pass: add every pending object to its queue (the job id is the object, so a duplicate is refused by the queue). */
export async function scanOnce(
  queues: Record<QueueKind, Pick<Queue, 'add'>>,
  store: ObjectStore,
  buckets: string[],
  log: Logger,
): Promise<number> {
  const pending = await findPending(store, buckets, log)
  for (const job of pending) await addMediaJob(queues[job.kind], job.kind, job.bucket, job.key)
  return pending.length
}

/** Run now, then after every interval, until the signal aborts. A failing run is the caller's to log; it never stops the loop. */
export async function startScanner(run: () => Promise<void>, intervalMs: number, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await run()
    } catch {
      // `run` logs its own failure; the next pass tries again.
    }
    try {
      await sleep(intervalMs, undefined, { signal })
    } catch {
      return
    }
  }
}
```

- [ ] **Passo 4: far passare**

Run: `npx vitest run worker/scan.test.ts`
Atteso: PASS.

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore.

- [ ] **Passo 5: commit**

```bash
git add worker/scan.ts worker/scan.test.ts
git commit -m "Add the safety-net scan that rebuilds the job list from the buckets"
```

---

### Compito 11: Avvio, salute, controllo a freddo e pacchetto

Il processo vero: code, worker, scansione, battito di salute (un file che il controllo di Docker legge), arresto morbido, e il controllo a freddo `--check` che prova l'immagine come la provava `deploy.sh` di Python (importare tutto e verificare AVIF). Un test di integrazione con un **Redis vero** prova il percorso intero.

**File:**
- Crea: `worker/runtime.ts`, `worker/health.ts`, `worker/selfcheck.ts`, `worker/main.ts`, `scripts/build-worker.mjs`
- Test: `worker/health.test.ts`, `worker/selfcheck.test.ts`, `worker/integration.test.ts`
- Modifica: `package.json` (script), `.gitignore`

**Interfacce:**
- Consuma: tutto ciò che producono i compiti 3-10.
- Produce:
  `createQueues(connection: ConnectionOptions, prefix: string): Record<QueueKind, Queue>`,
  `type Handlers = Record<QueueKind, Processor>`, `startWorkers(connection, prefix, handlers, log): Record<QueueKind, Worker>`;
  `runHealthBeat(options: { ping: () => Promise<boolean>; write: () => Promise<void>; intervalMs: number; signal: AbortSignal }): Promise<void>`;
  `selfCheck(): Promise<string[]>` (l'elenco dei problemi, vuoto se tutto va).

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// worker/health.test.ts
import { describe, expect, it, vi } from 'vitest'
import { runHealthBeat } from './health'

function run(ping: () => Promise<boolean>, beats: number) {
  const controller = new AbortController()
  const write = vi.fn(async () => { if (write.mock.calls.length >= beats) controller.abort() })
  return { controller, write, done: runHealthBeat({ ping, write, intervalMs: 5, signal: controller.signal }) }
}

describe('runHealthBeat', () => {
  it('writes the health file at every beat while Redis answers, and stops when told to', async () => {
    const { write, done } = run(async () => true, 3)
    await done
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('writes nothing while Redis does not answer: a missing file is how an unhealthy worker shows', async () => {
    const controller = new AbortController()
    const write = vi.fn(async () => {})
    const done = runHealthBeat({ ping: async () => false, write, intervalMs: 5, signal: controller.signal })
    setTimeout(() => controller.abort(), 40)
    await done
    expect(write).not.toHaveBeenCalled()
  })

  it('survives a ping that throws', async () => {
    const controller = new AbortController()
    let calls = 0
    const ping = async () => { if (++calls === 2) controller.abort(); throw new Error('down') }
    await runHealthBeat({ ping, write: async () => {}, intervalMs: 5, signal: controller.signal })
    expect(calls).toBe(2)
  })
})
```

```ts
// worker/selfcheck.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { selfCheck } from './selfcheck'
import { hasFfmpeg } from './testing/ffmpeg'

describe('selfCheck', () => {
  const savedPath = process.env.PATH
  afterEach(() => { process.env.PATH = savedPath })

  it.skipIf(!hasFfmpeg())('finds nothing wrong where ffmpeg, AVIF and libheif are all available', async () => {
    expect(await selfCheck()).toEqual([])
  })

  it('names ffmpeg when it is missing, instead of failing on the first video', async () => {
    process.env.PATH = ''
    const problems = await selfCheck()
    expect(problems.some((problem) => /ffmpeg/.test(problem))).toBe(true)
  })
})
```

```ts
// worker/integration.test.ts
// The whole path with a real Redis: enqueue → worker → result → status read back from the queue.
// Skipped without REDIS_URL; CI provides one (see .github/workflows/ci.yml, job `worker`).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMediaJob } from '@/lib/queues/add-job'
import { enqueueMediaJob } from '@/lib/queues/enqueue'
import { QUEUE_NAMES } from '@/lib/queues/names'
import { jobIdFor } from '@/lib/queues/options'
import { readStatusFromQueue } from '@/lib/queues/status'
import { loadConfig } from './config'
import { createPhotoHandler } from './jobs/photo'
import { createRenditionsHandler } from './jobs/renditions'
import { createVideoHandler } from './jobs/video'
import { createQueues, startWorkers } from './runtime'
import { dirStore } from './testing/dir-store'
import { makeImage } from './testing/images'

const url = process.env.REDIS_URL
const quiet = pino({ level: 'silent' })

describe.skipIf(!url)('enqueue → worker → status, with a real Redis', () => {
  const prefix = `bullmq-test-${randomUUID().slice(0, 8)}`
  let root: string
  let workdir: string
  let connection: Redis
  let eventsConnection: Redis
  let queues: ReturnType<typeof createQueues>
  let workers: ReturnType<typeof startWorkers>
  let events: QueueEvents
  const store = () => dirStore(root)
  let theStore: ReturnType<typeof dirStore>

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'int-store-'))
    workdir = await mkdtemp(join(tmpdir(), 'int-work-'))
    theStore = store()
    const config = loadConfig({
      APP_ENV: 'staging', REDIS_URL: url!, R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKETS: 'b', WORKDIR_BASE: workdir,
    })
    const deps = { store: theStore, config, log: quiet }
    connection = new Redis(url!, { maxRetriesPerRequest: null })
    eventsConnection = new Redis(url!, { maxRetriesPerRequest: null })
    queues = createQueues(connection, prefix)
    workers = startWorkers(
      connection, prefix,
      { video: createVideoHandler(deps), photo: createPhotoHandler(deps), renditions: createRenditionsHandler(deps) },
      quiet,
    )
    events = new QueueEvents(QUEUE_NAMES.photo, { connection: eventsConnection, prefix })
    await events.waitUntilReady()
  })

  afterAll(async () => {
    await Promise.all(Object.values(workers).map((worker) => worker.close()))
    await events.close()
    for (const queue of Object.values(queues)) {
      await queue.obliterate({ force: true })
      await queue.close()
    }
    connection.disconnect()
    eventsConnection.disconnect()
    await rm(root, { recursive: true, force: true })
    await rm(workdir, { recursive: true, force: true })
  })

  async function stage(key: string, content: Buffer) {
    const file = join(root, 'b', ...key.split('/'))
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content)
  }

  it('processes a staged photo end to end, and the site reads the outcome from the queue', async () => {
    const key = 'private/route-photos/r1/u1.PNG'
    await stage(key, await makeImage({ width: 1800, height: 1200 }))

    expect(await enqueueMediaJob(key, { bucket: 'b', queue: queues.photo })).toBe('queued')
    const job = await queues.photo.getJob(jobIdFor('b', key))
    await job!.waitUntilFinished(events, 60_000)

    expect(await theStore.exists('b', 'public/route-photos/r1/u1.avif')).toBe(true)
    expect(await theStore.exists('b', 'public/route-photos/r1/u1.w480.avif')).toBe(true)
    expect(await theStore.exists('b', key)).toBe(false)

    const status = await readStatusFromQueue(queues.photo, jobIdFor('b', key))
    expect(status).toMatchObject({ phase: 'done', progress: 100 })
    expect(status?.sha256).toMatch(/^[0-9a-f]{64}$/)
  }, 90_000)

  it('reports a job that cannot succeed as failed, with the reason', async () => {
    const key = 'private/route-photos/r1/missing.png'
    // One attempt only, so that the test does not wait out the real backoff.
    await queues.photo.add('process', { bucket: 'b', key }, { jobId: jobIdFor('b', key), attempts: 1 })
    const job = await queues.photo.getJob(jobIdFor('b', key))
    await job!.waitUntilFinished(events, 30_000).catch(() => undefined)

    const status = await readStatusFromQueue(queues.photo, jobIdFor('b', key))
    expect(status).toMatchObject({ phase: 'failed' })
    expect(status?.error).toMatch(/not found/i)
  }, 60_000)

  it('makes one job when the same object is added twice (the upload confirmation and the scan arriving together)', async () => {
    const queue = new Queue(`dup-${randomUUID().slice(0, 6)}`, { connection, prefix })
    try {
      await addMediaJob(queue, 'photo', 'b', 'private/route-photos/r1/dup.jpg')
      await addMediaJob(queue, 'photo', 'b', 'private/route-photos/r1/dup.jpg')
      expect((await queue.getJobCounts('waiting', 'delayed', 'active')).waiting).toBe(1)
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
```

- [ ] **Passo 2: vederli fallire**

Run: `npx vitest run worker/health.test.ts worker/selfcheck.test.ts`
Atteso: FAIL, moduli non trovati.

- [ ] **Passo 3: scrivere i moduli**

```ts
// worker/health.ts
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * A heartbeat as a file: while Redis answers, the file's modification time is renewed. Docker's health check reads it
 * (a file older than a minute means unhealthy), so the worker needs no open port to be checked.
 */
export async function runHealthBeat({
  ping,
  write,
  intervalMs,
  signal,
}: {
  ping: () => Promise<boolean>
  write: () => Promise<void>
  intervalMs: number
  signal: AbortSignal
}): Promise<void> {
  while (!signal.aborted) {
    try {
      if (await ping()) await write()
    } catch {
      // Not writing is the signal: the file goes stale and Docker says unhealthy.
    }
    try {
      await sleep(intervalMs, undefined, { signal })
    } catch {
      return
    }
  }
}
```

```ts
// worker/selfcheck.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { loadLibheif } from './heic'

const run = promisify(execFile)

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * What the image must be able to do, checked when it starts and by the deploy before it switches containers: write
 * AVIF, run ffmpeg and ffprobe, load libheif. Returns the problems found, empty when all is well. Failing here stops the
 * deploy; not failing here would mean failing on the first upload.
 */
export async function selfCheck(): Promise<string[]> {
  const problems: string[] = []

  try {
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).avif().toBuffer()
  } catch (err) {
    problems.push(`sharp cannot write AVIF: ${message(err)}`)
  }

  for (const program of ['ffmpeg', 'ffprobe']) {
    try {
      await run(program, ['-version'])
    } catch {
      problems.push(`${program} is not installed or does not run`)
    }
  }

  try {
    new (loadLibheif().HeifDecoder)()
  } catch (err) {
    problems.push(`libheif-js does not load: ${message(err)}`)
  }

  return problems
}
```

```ts
// worker/runtime.ts
import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq'
import { QUEUE_KINDS, QUEUE_NAMES, type QueueKind } from '@/lib/queues/names'
import type { Logger } from './logger'

export function createQueues(connection: ConnectionOptions, prefix: string): Record<QueueKind, Queue> {
  return Object.fromEntries(QUEUE_KINDS.map((kind) => [kind, new Queue(QUEUE_NAMES[kind], { connection, prefix })])) as Record<QueueKind, Queue>
}

export type Handlers = Record<QueueKind, Processor>

/**
 * One worker per queue, one job at a time each, deliberately: the machine has two cores and transcoding uses both; a
 * second job alongside would make every job slower rather than the batch faster. The lock lasts two minutes because ffmpeg
 * and sharp run outside the event loop's way, so the lock is renewed all the same.
 */
export function startWorkers(
  connection: ConnectionOptions,
  prefix: string,
  handlers: Handlers,
  log: Logger,
): Record<QueueKind, Worker> {
  const workers = {} as Record<QueueKind, Worker>
  for (const kind of QUEUE_KINDS) {
    const queue = QUEUE_NAMES[kind]
    const worker = new Worker(queue, handlers[kind], { connection, prefix, concurrency: 1, lockDuration: 120_000 })
    worker.on('failed', (job, err) =>
      log.error({ queue, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'job failed'),
    )
    worker.on('error', (err) => log.error({ queue, err: err.message }, 'worker error'))
    workers[kind] = worker
  }
  return workers
}
```

```ts
// worker/main.ts
import { writeFile } from 'node:fs/promises'
import { Redis } from 'ioredis'
import { QUEUE_KINDS, queuePrefix } from '@/lib/queues/names'
import { loadConfig } from './config'
import { runHealthBeat } from './health'
import { createPhotoHandler } from './jobs/photo'
import { createRenditionsHandler } from './jobs/renditions'
import { createVideoHandler } from './jobs/video'
import { log } from './logger'
import { createQueues, startWorkers } from './runtime'
import { scanOnce, startScanner } from './scan'
import { selfCheck } from './selfcheck'
import { s3Store } from './storage'

/** Docker's health check reads the age of this file. */
const HEALTH_FILE = '/tmp/healthy'
const HEALTH_INTERVAL_MS = 15_000

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function main(): Promise<void> {
  // Configuration first, so that a missing variable is named before anything else is attempted.
  const config = loadConfig()

  const problems = await selfCheck()
  if (process.argv.includes('--check')) {
    for (const problem of problems) log.error(problem)
    if (problems.length > 0) process.exit(1)
    log.info('check passed')
    return
  }
  if (problems.length > 0) throw new Error(`The worker cannot run here: ${problems.join('; ')}`)

  const store = s3Store(config.r2)
  // BullMQ needs null here: its blocking commands are not retried and failed on a timer.
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
  const prefix = queuePrefix(config.appEnv)
  const deps = { store, config, log }

  const queues = createQueues(connection, prefix)
  const workers = startWorkers(
    connection,
    prefix,
    { video: createVideoHandler(deps), photo: createPhotoHandler(deps), renditions: createRenditionsHandler(deps) },
    log,
  )

  const stop = new AbortController()
  const scanner = startScanner(
    async () => {
      try {
        const queued = await scanOnce(queues, store, config.buckets, log)
        if (queued > 0) log.info({ queued }, 'scan: queued work the site had not handed over')
      } catch (err) {
        log.error({ err: message(err) }, 'scan failed')
      }
    },
    config.scanIntervalS * 1000,
    stop.signal,
  )
  const health = runHealthBeat({
    ping: async () => (await connection.ping()) === 'PONG',
    write: () => writeFile(HEALTH_FILE, String(Date.now())),
    intervalMs: HEALTH_INTERVAL_MS,
    signal: stop.signal,
  })

  log.info({ env: config.appEnv, prefix, buckets: config.buckets }, 'worker started')

  await new Promise<void>((resolve) => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => resolve())
  })

  // close() waits for the job in progress: a transcode is not cut in half by a deploy. If the process is killed anyway,
  // the source is still in the bucket and the queue retries.
  log.info('shutting down: waiting for the job in progress')
  stop.abort()
  await Promise.all(QUEUE_KINDS.map((kind) => workers[kind].close()))
  await Promise.all(QUEUE_KINDS.map((kind) => queues[kind].close()))
  connection.disconnect()
  await Promise.all([scanner, health])
  log.info('stopped')
}

main().catch((err) => {
  log.fatal({ err: message(err) }, 'worker crashed')
  process.exit(1)
})
```

```js
// scripts/build-worker.mjs
// Bundles the worker (and the few site files it shares) into dist/worker/worker.mjs.
// `sharp` and `libheif-js` stay out of the bundle: sharp is native, libheif-js loads a .wasm file next to itself.
// dist/worker/package.json lists just those two, with the versions of the site's package.json, so the image installs
// nothing else.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const external = ['sharp', 'libheif-js']

mkdirSync('dist/worker', { recursive: true })

await build({
  entryPoints: ['worker/main.ts'],
  outfile: 'dist/worker/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  // The CommonJS packages in the bundle call require(); give them one.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
})

writeFileSync(
  'dist/worker/package.json',
  JSON.stringify(
    {
      name: 'lelettrica-media-worker',
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(external.map((name) => [name, pkg.dependencies[name]])),
    },
    null,
    2,
  ) + '\n',
)
console.log('worker written to dist/worker/')
```

In `package.json` aggiungere agli `scripts`: `"build:worker": "node scripts/build-worker.mjs"`. In `.gitignore` aggiungere una riga: `/dist`.

- [ ] **Passo 4: far passare i test che non servono Redis**

Run: `npx vitest run worker/health.test.ts worker/selfcheck.test.ts`
Atteso: PASS (il primo test di `selfcheck` è saltato se manca ffmpeg).

- [ ] **Passo 5: provare l'integrazione con un Redis vero**

```bash
docker run -d --name redis-test -p 6379:6379 redis:7.4-alpine
REDIS_URL=redis://localhost:6379 npx vitest run worker/integration.test.ts
docker rm -f redis-test
```
Atteso: PASS, tre test. Se il primo si blocca, controllare che `worker/jobs/photo.ts` sia raggiungibile dal `Worker` (nome della coda) e che il prefisso sia lo stesso.

- [ ] **Passo 6: il pacchetto**

Run: `npm run build:worker`
Atteso: `dist/worker/worker.mjs` e `dist/worker/package.json` creati, senza errori di `esbuild`.

Run, con valori finti (non serve connettersi a niente per `--check`):

```bash
APP_ENV=staging REDIS_URL=redis://x R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKETS=b node dist/worker/worker.mjs --check
```
Atteso: l'ultima riga di log dice `check passed` e il codice di uscita è 0. **Se la riga dice che `ffmpeg` manca**, installarlo sulla macchina di sviluppo o provare solo nell'immagine (compito 12).

- [ ] **Passo 7: commit**

```bash
git add worker/runtime.ts worker/health.ts worker/selfcheck.ts worker/main.ts worker/health.test.ts worker/selfcheck.test.ts worker/integration.test.ts scripts/build-worker.mjs package.json .gitignore
git commit -m "Start the worker: queues, scan, health file, soft shutdown and a cold check"
```

---

### Compito 12: L'immagine del worker e la CI

**File:**
- Crea: `Dockerfile.worker`
- Modifica: `.dockerignore`, `.github/workflows/ci.yml`

**Interfacce:**
- Consuma: `scripts/build-worker.mjs` (compito 11), `node worker.mjs --check`.
- Produce: l'immagine `Dockerfile.worker` (`CMD node worker.mjs`, `HEALTHCHECK` sul file `/tmp/healthy`), e il job `worker` della CI.

- [ ] **Passo 1: scrivere `Dockerfile.worker`**

```dockerfile
# syntax=docker/dockerfile:1
#
# The media worker: transcodes videos to HLS and turns photos into AVIF. No port: it only talks outward (to R2 and to
# Redis). Built from the same repository as the site, and shipped separately so that a site deploy never interrupts a
# transcode in progress.

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Build tooling only: nothing from this stage but dist/worker is shipped.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
COPY scripts/build-worker.mjs ./scripts/build-worker.mjs
RUN node scripts/build-worker.mjs

FROM node:24-bookworm-slim AS runner
# ffmpeg carries ffprobe, which reads the duration the progress percentage needs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/dist/worker/ ./
# Just sharp and libheif-js (see scripts/build-worker.mjs).
RUN npm install --omit=dev --no-audit --no-fund
ENV NODE_ENV=production
USER node
# The worker renews this file every 15 s while Redis answers; a file older than a minute means unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const s=require('fs').statSync('/tmp/healthy'); process.exit(Date.now()-s.mtimeMs<60000?0:1)"
CMD ["node", "--enable-source-maps", "worker.mjs"]
```

- [ ] **Passo 2: non portare nel contesto ciò che non serve**

In `.dockerignore` aggiungere in fondo:

```
dist
```

(`worker`, `lib`, `scripts` e `tsconfig.json` devono restare: il compito li copia. `docs`, `tests` e i `*.md` sono già esclusi.)

- [ ] **Passo 3: costruirla e provarla**

```bash
docker build -f Dockerfile.worker -t worker-test .
docker run --rm -e APP_ENV=staging -e REDIS_URL=redis://x -e R2_ACCOUNT_ID=x -e R2_ACCESS_KEY_ID=x -e R2_SECRET_ACCESS_KEY=x -e R2_BUCKETS=b worker-test node worker.mjs --check
```
Atteso: la build finisce, e `check passed`, codice di uscita 0: ffmpeg, AVIF e libheif funzionano **nell'immagine**. Se `sharp` o `libheif-js` non si trovano, controllare `dist/worker/package.json`.

- [ ] **Passo 4: aggiungere il job alla CI**

In `.github/workflows/ci.yml`, dopo il job `verify` (stessa indentazione), aggiungere:

```yaml
  worker:
    name: worker
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      redis:
        image: redis:7.4-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      # The integration tests encode a real clip: they need ffmpeg and ffprobe.
      - name: Install ffmpeg
        run: sudo apt-get update && sudo apt-get install -y --no-install-recommends ffmpeg

      - name: Worker tests, with a real Redis and a real ffmpeg
        run: npx vitest run worker lib/queues lib/media

      - name: Build the worker image and check that it starts
        run: |
          docker build -f Dockerfile.worker -t worker-ci .
          docker run --rm \
            -e APP_ENV=staging -e REDIS_URL=redis://redis:6379 \
            -e R2_ACCOUNT_ID=x -e R2_ACCESS_KEY_ID=x -e R2_SECRET_ACCESS_KEY=x -e R2_BUCKETS=b \
            worker-ci node worker.mjs --check
```

- [ ] **Passo 5: commit**

```bash
git add Dockerfile.worker .dockerignore .github/workflows/ci.yml
git commit -m "Add the worker image and a CI job that runs its tests against a real Redis"
```

- [ ] **Passo 6: aprire la PR 1**

```bash
git push -u origin feat/node-worker
gh pr create --base staging --head feat/node-worker --title "The media worker in Node.js: shared key rules, queue contract, the worker and its image" --body "Fondamenta e worker (compiti 1-12 del piano). Aggiuntiva: il comportamento del sito non cambia. Il passaggio del sito alla nuova coda è la PR 3."
```
Poi lanciare in background lo script di unione (squash, verso `staging`) e passare al compito 13 senza aspettare i check.

---

### Compito 13: Redis sulla VM, ingresso unico SSH e deploy del worker

Solo file: nulla viene acceso finché non si fanno le operazioni del compito 16.

**File:**
- Crea: `deploy/redis/compose.yml`, `deploy/redis/redis.conf`, `deploy/redis/users.acl.template`, `deploy/redis/render-acl.sh`, `deploy/deploy-entry.sh`, `deploy/worker/deploy.sh`, `deploy/worker/make-env.sh`, `deploy/worker/env.template`, `.github/workflows/deploy-worker.yml`
- Modifica: `deploy/web/deploy.sh`, `deploy/web/env.template`, `.github/workflows/deploy.yml`

**Interfacce:**
- Consuma: l'immagine di `Dockerfile.worker`, il segreto `DEPLOY_SSH_KEY` e le variabili `DEPLOY_HOST`, `DEPLOY_HOST_KEY`, `DEPLOY_PRODUCTION` già presenti su GitHub.
- Produce: `ssh … "worker deploy <staging|production> <digest>"` e `"worker rollback <env>"`; la rete Docker `internal`; i file `web.redis-url` e `worker.redis-url` sulla VM.

- [ ] **Passo 1: Redis**

```yaml
# deploy/redis/compose.yml
# The one Redis of the machine: the queues of the media worker and the site's read cache. It publishes no port and sits
# on an internal network (no route out) that the site and the worker join. Persistence is an append-only file; the queues
# must never be evicted, and the cache keys all have an expiry.
#
# Needs users.acl (see render-acl.sh) next to this file.

services:
  redis:
    image: redis:7.4-alpine
    container_name: redis
    command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
    volumes:
      - ./redis.conf:/usr/local/etc/redis/redis.conf:ro
      - ./users.acl:/usr/local/etc/redis/users.acl:ro
      - redis-data:/data
    networks:
      - internal
    healthcheck:
      # The `probe` user may only PING, with any password.
      test: ["CMD", "redis-cli", "--user", "probe", "--pass", "probe", "--no-auth-warning", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  redis-data:

networks:
  internal:
    name: internal
    internal: true
```

```
# deploy/redis/redis.conf
aclfile /usr/local/etc/redis/users.acl
appendonly yes
appendfsync everysec
save ""
maxmemory 512mb
# BullMQ needs this: a queue's keys must never be evicted to make room.
maxmemory-policy noeviction
```

```
# deploy/redis/users.acl.template
# Rendered into users.acl by render-acl.sh, which puts the hash of a fresh password in place of each placeholder.
# Nobody logs in as `default`. The site and the worker get only what BullMQ and the cache need, and only their own keys.
user default off
user probe on nopass -@all +ping
user web on #__WEB_HASH__ ~bullmq-* ~cache:* +@all -@dangerous +info +config|get +client|list +client|id +client|setname +client|getname +client|setinfo
user worker on #__WORKER_HASH__ ~bullmq-* +@all -@dangerous +info +config|get +client|list +client|id +client|setname +client|getname +client|setinfo
```

```bash
#!/usr/bin/env bash
# deploy/redis/render-acl.sh — run once on the VM, from ~/docker/redis.
#
# Makes a password for the site and one for the worker, writes their hashes into users.acl, and the ready-to-use
# connection strings into web.redis-url and worker.redis-url (mode 600). The passwords exist nowhere else.
# Run again with --rotate to replace them (and then rewrite the env files that hold the old ones).
set -euo pipefail
cd "$(dirname "$0")"

if [ -f users.acl ] && [ "${1:-}" != "--rotate" ]; then
  echo "users.acl exists: pass --rotate to replace the passwords" >&2
  exit 1
fi

umask 077
web_password=$(openssl rand -hex 24)
worker_password=$(openssl rand -hex 24)
hash() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

sed -e "s/__WEB_HASH__/$(hash "$web_password")/" -e "s/__WORKER_HASH__/$(hash "$worker_password")/" users.acl.template > users.acl
# Only hashes in there, and the redis user inside the container has to read it.
chmod 644 users.acl

printf 'redis://web:%s@redis:6379\n' "$web_password" > web.redis-url
printf 'redis://worker:%s@redis:6379\n' "$worker_password" > worker.redis-url
echo "written: users.acl, web.redis-url, worker.redis-url"
```

- [ ] **Passo 2: l'ingresso unico SSH**

La chiave di deploy oggi può lanciare solo `deploy/web/deploy.sh`. Per aggiungere il worker senza una seconda chiave, un piccolo smistatore valida la forma del comando e lo passa allo script giusto. **Compatibile all'indietro**: la forma vecchia (`deploy …`, `rollback …`) continua ad andare al sito.

```bash
#!/usr/bin/env bash
# deploy/deploy-entry.sh — the one command the GitHub Actions deploy key may run (forced command in authorized_keys).
#
#   deploy <env> <digest>          the site (the original form, kept so the existing workflow works unchanged)
#   rollback <env>                 the site
#   worker deploy <env> <digest>   the media worker
#   worker rollback <env>
#
# Each script validates its own arguments; this only chooses which one.
set -euo pipefail

read -r -a ARGS <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${ARGS[0]:-}" in
  deploy | rollback) exec "$HOME/docker/web/deploy.sh" ;;
  worker) exec "$HOME/docker/media-worker/deploy.sh" "${ARGS[@]:1}" ;;
  *)
    echo "unknown command" >&2
    exit 2
    ;;
esac
```

- [ ] **Passo 3: il deploy del worker**

```bash
#!/usr/bin/env bash
# deploy/worker/deploy.sh — deploys one digest of ghcr.io/lelettricaleoni/lelettricaleoni-worker to one environment, and can
# put the previous one back. Reached only through deploy-entry.sh.
#
#   deploy.sh deploy   <staging|production> <sha256 digest, no prefix>
#   deploy.sh rollback <staging|production>
#
# Like the site's script, the new container starts beside the old one and the switch happens only when the new one is
# healthy. Unlike the site's, the old container is not waited for: it is told to finish the job it is on and exit
# (`stop_timeout` is half an hour), so a deploy never cuts a transcode in half and never holds the connection open.
set -euo pipefail

REPO="ghcr.io/lelettricaleoni/lelettricaleoni-worker"
DIR="${MEDIA_WORKER_DIR:-$HOME/docker/media-worker}"

read -r -a ARGS <<<"$*"
ACTION="${ARGS[0]:-}"
ENV_NAME="${ARGS[1]:-}"
DIGEST="${ARGS[2]:-}"

usage() { echo "usage: deploy.sh deploy <staging|production> <digest> | rollback <staging|production>" >&2; exit 2; }
case "$ENV_NAME" in staging | production) ;; *) usage ;; esac

ENV_FILE="$DIR/$ENV_NAME.env"
LABEL="lelettrica.worker=$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "[deploy] missing $ENV_FILE" >&2; exit 2; }

running() { docker ps -q --filter "label=$LABEL" --filter status=running; }
stopped() { docker ps -aq --filter "label=$LABEL" --filter status=exited; }

wait_healthy() {
  local name="$1" i status
  for i in $(seq 1 60); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo gone)
    [ "$status" = healthy ] && return 0
    [ "$status" = gone ] && return 1
    sleep 2
  done
  return 1
}

# Tell a container to finish its job and exit; do not wait, and do not let Docker bring it back.
drain() {
  docker update --restart no "$1" >/dev/null
  docker kill --signal SIGTERM "$1" >/dev/null
}

case "$ACTION" in
deploy)
  [[ "$DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo "[deploy] not a sha256 digest" >&2; exit 2; }
  IMAGE="$REPO@sha256:$DIGEST"
  NAME="media-worker-$ENV_NAME-${DIGEST:0:12}"

  if [ -n "$(docker ps -q --filter "name=^$NAME\$" --filter status=running)" ]; then
    echo "[deploy] $NAME is already running, nothing to do"
    exit 0
  fi

  echo "[deploy] pulling $IMAGE"
  docker pull "$IMAGE"

  # The image must be able to start with this environment's real settings before anything is replaced.
  echo "[deploy] cold check"
  if ! docker run --rm --env-file "$ENV_FILE" -e APP_ENV="$ENV_NAME" "$IMAGE" node worker.mjs --check; then
    echo "[deploy] the cold check failed, nothing changed" >&2
    exit 1
  fi

  OLD=$(running)
  SPARE=$(stopped)
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  echo "[deploy] starting $NAME"
  docker run -d --name "$NAME" --label "$LABEL" \
    --env-file "$ENV_FILE" -e APP_ENV="$ENV_NAME" \
    --memory 4g --memory-swap 4g --cpu-shares 256 \
    --stop-timeout 1800 --restart unless-stopped \
    "$IMAGE" >/dev/null
  # Outbound access (R2) comes from the default network; Redis is on the internal one.
  docker network connect internal "$NAME"

  if ! wait_healthy "$NAME"; then
    echo "[deploy] $NAME is not healthy, leaving the running version alone. Last log lines:" >&2
    docker logs --tail 25 "$NAME" >&2 || true
    docker rm -f "$NAME" >/dev/null
    exit 1
  fi

  # Only one spare is kept.
  # shellcheck disable=SC2086
  [ -z "$SPARE" ] || docker rm $SPARE >/dev/null

  for id in $OLD; do drain "$id"; done
  docker image prune -f >/dev/null
  echo "[deploy] OK, $ENV_NAME runs $IMAGE (the previous one finishes its job and exits)"
  ;;

rollback)
  PREVIOUS=$(stopped | head -n 1)
  [ -n "$PREVIOUS" ] || { echo "[deploy] no previous version kept for $ENV_NAME" >&2; exit 1; }
  CURRENT=$(running)
  docker update --restart unless-stopped "$PREVIOUS" >/dev/null
  docker start "$PREVIOUS" >/dev/null
  NAME=$(docker inspect --format '{{.Name}}' "$PREVIOUS" | tr -d /)
  if ! wait_healthy "$NAME"; then
    echo "[deploy] the previous version does not come up healthy either; the running one is untouched" >&2
    docker stop --time 5 "$PREVIOUS" >/dev/null
    docker update --restart no "$PREVIOUS" >/dev/null
    exit 1
  fi
  for id in $CURRENT; do drain "$id"; done
  echo "[deploy] OK, $ENV_NAME is back on $NAME"
  ;;

*) usage ;;
esac
```

```bash
#!/usr/bin/env bash
# deploy/worker/make-env.sh — run on the VM: builds ~/docker/media-worker/<env>.env from what the site already has
# (the R2 credentials and bucket of that environment) and the worker's Redis connection string. Prints no secret.
set -euo pipefail

ENV_NAME="${1:?usage: make-env.sh <staging|production>}"
case "$ENV_NAME" in staging | production) ;; *) echo "unknown environment" >&2; exit 2 ;; esac

WEB_ENV="$HOME/docker/web/$ENV_NAME.env"
REDIS_URL_FILE="$HOME/docker/redis/worker.redis-url"
OUT="$HOME/docker/media-worker/$ENV_NAME.env"
[ -f "$WEB_ENV" ] || { echo "missing $WEB_ENV" >&2; exit 1; }
[ -f "$REDIS_URL_FILE" ] || { echo "missing $REDIS_URL_FILE (run render-acl.sh first)" >&2; exit 1; }
[ ! -f "$OUT" ] || { echo "$OUT exists: remove it first if you mean to rebuild it" >&2; exit 1; }

umask 077
pick() { grep -E "^$1=" "$WEB_ENV" | head -n 1; }
{
  pick R2_ACCOUNT_ID
  pick R2_ACCESS_KEY_ID
  pick R2_SECRET_ACCESS_KEY
  echo "R2_BUCKETS=$(pick R2_BUCKET_NAME | cut -d= -f2-)"
  echo "REDIS_URL=$(cat "$REDIS_URL_FILE")"
} > "$OUT"
echo "written $OUT"
```

```
# deploy/worker/env.template — what ~/docker/media-worker/<env>.env holds (make-env.sh writes it). Names only.
# APP_ENV is set by deploy.sh. The optional settings below have the defaults shown.

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
# The bucket(s) of this environment, comma separated: lelettrica-trails (production), dev-lelettrica-trails (staging)
R2_BUCKETS=
# The worker's own Redis user (see deploy/redis)
REDIS_URL=

# SCAN_INTERVAL_S=600
# IMAGE_MAX_EDGE=2400
# IMAGE_QUALITY=65
# IMAGE_EFFORT=3
# IMAGE_SHARE_EDGE=1200
# IMAGE_SHARE_QUALITY=82
# LOG_LEVEL=info
```

- [ ] **Passo 4: il workflow di deploy del worker**

```yaml
# .github/workflows/deploy-worker.yml
name: deploy-worker

# Builds the media worker image and puts it on the Oracle VM: `staging` goes to the staging worker (the development
# bucket), `main` to the production one. Same shape as deploy.yml, and only when something the worker is made of changes.
# Production is switched on with the repository variable DEPLOY_PRODUCTION=true, as for the site.
#
# The third-party actions are pinned to a full commit SHA, for the reason given in deploy.yml.

on:
  push:
    branches: [main, staging]
    paths:
      - 'worker/**'
      - 'lib/media/**'
      - 'lib/queues/**'
      - 'Dockerfile.worker'
      - 'scripts/build-worker.mjs'
      - 'package-lock.json'
      - '.github/workflows/deploy-worker.yml'
  workflow_dispatch:

concurrency:
  group: deploy-worker-${{ github.ref_name }}
  cancel-in-progress: false

jobs:
  deploy:
    name: deploy-worker
    runs-on: ubuntu-24.04-arm
    if: github.ref_name == 'staging' || vars.DEPLOY_PRODUCTION == 'true'
    environment: ${{ github.ref_name == 'main' && 'production' || 'staging' }}

    permissions:
      contents: read
      packages: write

    env:
      IMAGE: ghcr.io/${{ github.repository_owner }}/lelettricaleoni-worker
      TARGET: ${{ github.ref_name == 'main' && 'production' || 'staging' }}

    steps:
      - uses: actions/checkout@v7

      - uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3.12.0

      - uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9 # v3.7.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        id: build
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6.19.2
        with:
          context: .
          file: Dockerfile.worker
          push: true
          platforms: linux/arm64
          tags: |
            ${{ env.IMAGE }}:${{ env.TARGET }}
            ${{ env.IMAGE }}:${{ github.sha }}
          cache-from: type=gha,scope=worker-${{ env.TARGET }}
          cache-to: type=gha,mode=max,scope=worker-${{ env.TARGET }}

      - name: Deploy on the VM
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
          DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}
          DEPLOY_HOST_KEY: ${{ vars.DEPLOY_HOST_KEY }}
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s %s\n' "$DEPLOY_HOST" "$DEPLOY_HOST_KEY" > ~/.ssh/known_hosts
          ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
            ubuntu@"$DEPLOY_HOST" "worker deploy $TARGET ${DIGEST#sha256:}"
```

- [ ] **Passo 5: il sito entra nella rete interna**

In `deploy/web/deploy.sh`, subito dopo il blocco `docker run -d --name "$NAME" … "$IMAGE" >/dev/null` (prima del `if ! { wait_healthy …`), aggiungere:

```bash
  # The internal network, where Redis is, exists once Redis has been set up; until then there is nothing to join.
  if docker network inspect internal >/dev/null 2>&1; then
    docker network connect internal "$NAME"
  fi
```

In `deploy/web/env.template`, sostituire il blocco «Upstash Redis: read cache and transcoding state» (le due righe `UPSTASH_REDIS_REST_URL=` e `UPSTASH_REDIS_REST_TOKEN=` con il loro commento) con:

```
# The VM's Redis (read cache, and the media queues the site adds to and reads): the site's own user, see deploy/redis.
# Empty means "no Redis": everything that uses it then does nothing.
REDIS_URL=
```

In `.github/workflows/deploy.yml`, nella lista `paths-ignore:` aggiungere, dopo `'**/*.md'`:

```yaml
      - 'worker/**'
      - 'Dockerfile.worker'
      - 'deploy/worker/**'
      - 'deploy/redis/**'
      - 'scripts/build-worker.mjs'
```

- [ ] **Passo 6: controllare la sintassi degli script**

```bash
bash -n deploy/redis/render-acl.sh deploy/deploy-entry.sh deploy/worker/deploy.sh deploy/worker/make-env.sh deploy/web/deploy.sh
```
Atteso: nessun output. Poi, con Docker acceso, provare l'ACL con un Redis locale (non cambia nulla in produzione):

```bash
mkdir -p "$TEMP/redis-try" && cp deploy/redis/{redis.conf,users.acl.template,render-acl.sh,compose.yml} "$TEMP/redis-try/"
(cd "$TEMP/redis-try" && bash render-acl.sh && docker compose up -d && sleep 4 && docker compose ps)
```
Atteso: `redis` è `healthy`. Provare gli utenti:

```bash
WEB=$(cat "$TEMP/redis-try/web.redis-url")
docker run --rm --network internal redis:7.4-alpine redis-cli -u "$WEB" set cache:test:k 1 EX 60
docker run --rm --network internal redis:7.4-alpine redis-cli -u "$WEB" set other:key 1
docker run --rm --network internal redis:7.4-alpine redis-cli -u "$WEB" flushall
docker run --rm --network internal redis:7.4-alpine redis-cli -u "$WEB" client list
```
Atteso: il primo `OK`; il secondo e il terzo `NOPERM` (chiave fuori dai prefissi, comando pericoloso); il quarto elenca i client (serve a BullMQ per sapere chi è collegato). Poi `(cd "$TEMP/redis-try" && docker compose down -v)`.

- [ ] **Passo 7: commit e PR 2**

**Prima di aprire la PR 2, la PR 1 deve essere unita** (`gh pr view <numero> --json state -q .state` dice `MERGED`): `deploy-worker.yml`, appena unito in `staging`, costruirebbe `Dockerfile.worker`, che esiste solo con la PR 1.

```bash
git switch -c feat/node-worker-deploy origin/staging
git add deploy .github/workflows/deploy-worker.yml .github/workflows/deploy.yml
git commit -m "Redis on the VM, a single SSH entry point and the worker's deploy"
git push -u origin feat/node-worker-deploy
gh pr create --base staging --head feat/node-worker-deploy --title "Redis on the VM, a single SSH entry point and the worker's deploy" --body "File per la VM (compito 13 del piano). Non accende nulla: le operazioni sulla VM sono nel compito 16."
```
Poi lo script di unione in background.

---

### Compito 14: Il sito passa al nuovo sistema (PR 3)

Qui il comportamento del sito cambia: cache, stato dei lavori, conferma del caricamento e pagina `/manage/dev` passano dal Redis della VM. **Si unisce solo dopo che Redis e il worker di `staging` sono accesi** (compito 16, parte 1), altrimenti `staging` resta senza stato.

**File:**
- Crea: `lib/actions/media-jobs.test.ts`
- Modifica: `lib/cache.ts`, `lib/dev-stats.ts`, `lib/video-jobs.ts`, `lib/video-jobs.test.ts`, `lib/actions/media-jobs.ts`, `components/admin/media-upload.tsx`, `app/manage/dev/page.tsx`, `lib/routes-data.ts` (un commento), `.env.local.example`, `package.json`
- Elimina: `lib/worker-heartbeat.ts`, `lib/worker-heartbeat.test.ts`

**Interfacce:**
- Consuma: `enqueueMediaJob`, `readJobStatus`, `readWorkerHeartbeat`, `countJobs`, `getQueue`, `getCacheRedis`, `redisCacheStore`, `settle`.
- Produce: `confirmMediaUpload(storageKey: string): Promise<void>` (Server Action); `getMediaJobStatuses` invariata nella forma; `VideoJobStatus` e `isTrackedJobKey` invariati (solo `bike-model-videos/` si aggiunge ai prefissi seguiti).

- [ ] **Passo 1: ramo**

```bash
git switch -c feat/node-worker-wiring origin/staging
```
(Dopo che le PR 1 e 2 sono unite, `origin/staging` contiene tutto il resto del piano.)

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// lib/actions/media-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminUser = vi.fn()
const enqueueMediaJob = vi.fn(async (..._args: unknown[]) => 'queued')
const readJobStatus = vi.fn(async (..._args: unknown[]): Promise<unknown> => null)

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: () => getAdminUser() }))
vi.mock('@/lib/queues/enqueue', () => ({ enqueueMediaJob: (...args: unknown[]) => enqueueMediaJob(...args) }))
vi.mock('@/lib/queues/status', () => ({ readJobStatus: (...args: unknown[]) => readJobStatus(...args) }))

import { confirmMediaUpload, getMediaJobStatuses } from './media-jobs'

beforeEach(() => {
  getAdminUser.mockReset()
  enqueueMediaJob.mockClear()
  readJobStatus.mockReset()
  readJobStatus.mockResolvedValue(null)
})

describe('confirmMediaUpload', () => {
  it('hands the uploaded file to the worker when the admin confirms it', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    await confirmMediaUpload('private/route-photos/r1/u1.jpg')
    expect(enqueueMediaJob).toHaveBeenCalledWith('private/route-photos/r1/u1.jpg')
  })

  it('does nothing for someone who is not an admin', async () => {
    getAdminUser.mockResolvedValue(null)
    await confirmMediaUpload('private/route-photos/r1/u1.jpg')
    expect(enqueueMediaJob).not.toHaveBeenCalled()
  })

  it('does nothing for a key the worker does not process (a GPX file, a public photo)', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    await confirmMediaUpload('route-gpx/r1/track.gpx')
    await confirmMediaUpload('public/route-photos/r1/u1.avif')
    expect(enqueueMediaJob).not.toHaveBeenCalled()
  })
})

describe('getMediaJobStatuses', () => {
  it('answers nothing to someone who is not an admin', async () => {
    getAdminUser.mockResolvedValue(null)
    expect(await getMediaJobStatuses(['private/route-photos/r1/u1.jpg'])).toEqual({})
    expect(readJobStatus).not.toHaveBeenCalled()
  })

  it('reads the status of the tracked keys only, and returns only the ones that have one', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    readJobStatus.mockImplementation(async (key: unknown) =>
      key === 'private/route-photos/r1/a.jpg' ? { phase: 'done', progress: 100, updatedAt: 1 } : null,
    )
    const result = await getMediaJobStatuses([
      'private/route-photos/r1/a.jpg',
      'private/route-photos/r1/b.jpg',
      'route-gpx/r1/track.gpx',
    ])
    expect(result).toEqual({ 'private/route-photos/r1/a.jpg': { phase: 'done', progress: 100, updatedAt: 1 } })
    expect(readJobStatus).toHaveBeenCalledTimes(2)
  })

  it('looks at no more than fifty keys at a time', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    const keys = Array.from({ length: 80 }, (_, i) => `private/route-photos/r1/${i}.jpg`)
    await getMediaJobStatuses(keys)
    expect(readJobStatus).toHaveBeenCalledTimes(50)
  })
})
```

Sostituire `lib/video-jobs.test.ts` con (restano solo i casi di `isTrackedJobKey`, quelli di `jobKey`, `parseStatus` e `readJobStatus` non esistono più qui):

```ts
import { describe, expect, it } from 'vitest'
import { isTrackedJobKey } from './video-jobs'

describe('isTrackedJobKey', () => {
  it('accepts the staging keys the worker turns into something playable or viewable', () => {
    expect(isTrackedJobKey('private/route-videos/r/u.mp4')).toBe(true)
    expect(isTrackedJobKey('private/bike-model-videos/m/u.mov')).toBe(true)
    expect(isTrackedJobKey('private/route-photos/r/u.heic')).toBe(true)
    expect(isTrackedJobKey('private/bike-model-photos/m/u.tif')).toBe(true)
  })

  it('rejects everything else, and anything that is not a string', () => {
    expect(isTrackedJobKey('route-photos/r/u.jpg')).toBe(false)
    expect(isTrackedJobKey('public/route-photos/r/u.avif')).toBe(false)
    expect(isTrackedJobKey('__worker__')).toBe(false)
    expect(isTrackedJobKey('hls:v2:private/route-videos/r/u.mp4')).toBe(false)
    expect(isTrackedJobKey(42)).toBe(false)
    expect(isTrackedJobKey(undefined)).toBe(false)
  })
})
```

- [ ] **Passo 3: vederli fallire**

Run: `npx vitest run lib/actions/media-jobs.test.ts lib/video-jobs.test.ts`
Atteso: FAIL (`confirmMediaUpload` non esiste; `isTrackedJobKey` non accetta ancora `bike-model-videos`).

- [ ] **Passo 4: riscrivere `lib/video-jobs.ts`**

```ts
import { PHOTO_STAGING_PREFIXES, VIDEO_STAGING_PREFIXES } from './media/keys'
import { JOB_PHASES } from './queues/schemas'

/**
 * Where a video or a photo is in processing, as reported by the media worker through the queue (lib/queues/status.ts).
 *
 * The site used to infer this from the existence of a manifest — a yes/no that could not tell "still working" from
 * "storage unreachable", and made a failure invisible. It now asks the queue, which knows the state, the progress and
 * the reason of a failure, and the shape here is the one the panel has always read.
 *
 * Photos are reported through here too, with the same phases (`transcoding` included, for a photo being encoded).
 */
export const VIDEO_JOB_PHASES = JOB_PHASES
export type VideoJobPhase = (typeof VIDEO_JOB_PHASES)[number]

export interface VideoJobStatus {
  phase: VideoJobPhase
  /** 0-100 while transcoding; absent in phases that have no measurable middle. */
  progress?: number
  attempt?: number
  error?: string
  /** Epoch milliseconds, so a stale entry can be recognised as stale. */
  updatedAt: number
  /** Set once, alongside `phase: 'done'` — the source file's SHA-256, computed by the worker before deleting it. */
  sha256?: string
}

/** Storage keys the worker reports on: what it takes from staging and turns into something playable or viewable. */
export const TRACKED_JOB_PREFIXES = [...VIDEO_STAGING_PREFIXES, ...PHOTO_STAGING_PREFIXES] as const

export function isTrackedJobKey(key: unknown): key is string {
  return typeof key === 'string' && TRACKED_JOB_PREFIXES.some((prefix) => key.startsWith(prefix))
}
```

- [ ] **Passo 5: riscrivere `lib/actions/media-jobs.ts`**

```ts
'use server'
import { enqueueMediaJob } from '@/lib/queues/enqueue'
import { readJobStatus } from '@/lib/queues/status'
import { getAdminUser } from '@/lib/supabase/server'
import { isTrackedJobKey, type VideoJobStatus } from '@/lib/video-jobs'

/**
 * Worker status for the videos and photos shown in the admin panel.
 *
 * A Server Action rather than a route handler: the caller is our own client.
 */
export async function getMediaJobStatuses(
  storageKeys: string[],
): Promise<Record<string, VideoJobStatus>> {
  if (!(await getAdminUser())) return {}

  // Bounded: a panel with many items must not turn into an unbounded fan-out against the queue on every poll.
  const keys = storageKeys.filter(isTrackedJobKey).slice(0, 50)

  const entries = await Promise.all(keys.map(async (key) => [key, await readJobStatus(key)] as const))

  return Object.fromEntries(entries.filter((e): e is readonly [string, VideoJobStatus] => e[1] !== null))
}

/**
 * The browser calls this once a file has landed in the bucket, so that the worker starts now instead of at its next
 * scan. It never fails the upload: with the queue down, the scan finds the file within minutes.
 */
export async function confirmMediaUpload(storageKey: string): Promise<void> {
  if (!(await getAdminUser())) return
  if (!isTrackedJobKey(storageKey)) return
  await enqueueMediaJob(storageKey)
}
```

- [ ] **Passo 6: il browser conferma il caricamento**

In `components/admin/media-upload.tsx`: se il file importa già qualcosa da `@/lib/actions/media-jobs` (per `getMediaJobStatuses`), aggiungere `confirmMediaUpload` a quell'importazione; altrimenti aggiungere `import { confirmMediaUpload } from '@/lib/actions/media-jobs'`. Poi, nel blocco che segue il `PUT` riuscito, sostituire:

```tsx
      // From here the bar belongs to the worker's status.
      patch({ upload: undefined })
```

con:

```tsx
      // Tell the server the file is in place, so the worker starts now instead of at its next scan. A failure here is
      // not an upload failure: the scan finds the file within minutes.
      void confirmMediaUpload(key).catch((err) => console.error(err))

      // From here the bar belongs to the worker's status.
      patch({ upload: undefined })
```

- [ ] **Passo 7: la cache passa a Redis**

Sostituire il contenuto di `lib/cache.ts` con:

```ts
import type { Redis } from 'ioredis'
import { getCacheRedis } from '@/lib/redis'
import { settle } from '@/lib/settle'

/**
 * Read-through cache on the VM's Redis.
 *
 * Every page here renders on demand, so work that could be done once per video or per GPX file would otherwise be redone
 * on every request. This caches the results that never change once produced.
 *
 * Three rules, all of them consequences of the same incident: a feature-flag migration put an external service on the
 * critical path of every request with no bound, and made the home page forty times slower.
 *
 * 1. **Unconfigured is fine.** With no REDIS_URL the cache is a no-op and the caller does its normal work. Local
 *    development and CI need no Redis.
 * 2. **Fail open.** A cache error, or a slow one, never fails a request and never propagates — the caller falls through
 *    to the real source.
 * 3. **Bounded.** No cache call may hold a request for longer than CACHE_TIMEOUT_MS, whatever Redis is doing.
 */

/** No visitor waits longer than this for a cache lookup. */
export const CACHE_TIMEOUT_MS = 250

/** The slice of Redis this module uses, so tests can supply their own. */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>
}

/**
 * A CacheStore over an ioredis connection. Values go in as JSON and come back parsed; a value that is not JSON makes
 * `get` reject, which readThrough treats as a miss.
 */
export function redisCacheStore(redis: Pick<Redis, 'get' | 'set'>): CacheStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await redis.get(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    },
    set: (key, value, { ex }) => redis.set(key, JSON.stringify(value), 'EX', ex),
  }
}

let resolved: CacheStore | null | undefined

/** The configured store, or null when there is no Redis. */
export function getStore(): CacheStore | null {
  if (resolved !== undefined) return resolved
  const redis = getCacheRedis()
  resolved = redis ? redisCacheStore(redis) : null
  if (!resolved) console.info('[cache] REDIS_URL not set — caching disabled')
  return resolved
}

/**
 * Return the cached value for `key`, or run `produce` and cache what it returns.
 *
 * `ttlSeconds` may depend on the produced value — a video that is still transcoding should be re-checked in seconds,
 * while one that is ready never changes again.
 *
 * A produced value of `null` or `undefined` is never cached: callers use it to mean "nothing here yet", and remembering
 * that for a week would hide a video for a week.
 */
export async function readThrough<T>(
  key: string,
  produce: () => Promise<T>,
  ttlSeconds: number | ((value: T) => number),
  store: CacheStore | null = getStore(),
): Promise<T> {
  if (store) {
    const hit = await settle(store.get<T>(key), CACHE_TIMEOUT_MS)
    if (hit !== null && hit !== undefined) return hit
  }

  const value = await produce()

  if (store && value !== null && value !== undefined) {
    const ttl = typeof ttlSeconds === 'function' ? ttlSeconds(value) : ttlSeconds
    if (ttl > 0) {
      // Not awaited beyond its bound: writing the cache must not delay the response
      void settle(store.set(key, value, { ex: ttl }), CACHE_TIMEOUT_MS)
    }
  }

  return value
}

/** Drop the resolved store. Exists for tests. */
export function resetStoreForTests(): void {
  resolved = undefined
}
```

- [ ] **Passo 8: `lib/dev-stats.ts`**

Sostituire dall'inizio del file fino alla fine della funzione `getRedisStats` (lasciando intatto tutto da `export interface PostgresStats` in poi) con:

```ts
import { sql } from 'drizzle-orm'
import { db, routes, media, routeTranslations } from '@/lib/db'
import { countJobs } from '@/lib/queues/counts'
import { QUEUE_KINDS } from '@/lib/queues/names'
import { getQueue } from '@/lib/queues/queues'
import { getCacheRedis } from '@/lib/redis'
import { settle } from '@/lib/settle'

/**
 * A read-only look at the services behind the site, for the dev-tools page.
 * Every function here fails to `null` rather than throwing: one service
 * being unreachable must not blank the whole page, and this is a diagnostic
 * screen, not a request path anything else depends on.
 *
 * Every external call is bounded by `settle()` — the same lesson lib/cache.ts
 * was built from: an unbounded external call on a request path once made the
 * home page 40x slower. This page found out again the hard way, hanging on a
 * Redis call with no timeout at all until the visitor gave up.
 */

/** Generous compared to lib/cache.ts's 250ms: this page is visited on
 *  purpose, not on every request, so it can afford to wait a little longer
 *  for a real answer — but it must still always resolve. */
const TIMEOUT_MS = 5000

export interface RedisStats {
  totalKeys: number
  /** Jobs the queues know about right now: waiting, running, delayed and failed. */
  trackedJobs: number
}

export async function getRedisStats(): Promise<RedisStats | null> {
  const redis = getCacheRedis()
  if (!redis) return null

  const result = await settle(
    Promise.all([
      redis.dbsize(),
      Promise.all(
        QUEUE_KINDS.map((kind) => getQueue(kind)?.getJobCounts('waiting', 'active', 'delayed', 'failed') ?? null),
      ),
    ]),
    TIMEOUT_MS,
  )
  if (!result) {
    console.error('[dev-stats] getRedisStats: query timed out or failed')
    return null
  }

  const [totalKeys, counts] = result
  return { totalKeys, trackedJobs: countJobs(counts) }
}
```

(Il resto del file continua a usare `settle` e `TIMEOUT_MS`, che ora arrivano dall'importazione e dalla costante qui sopra.)

- [ ] **Passo 9: la pagina `/manage/dev`**

In `app/manage/dev/page.tsx`: sostituire l'importazione `import { readWorkerHeartbeat, type ActiveJob, type WorkerHeartbeat } from '@/lib/worker-heartbeat'` con:

```tsx
import { readWorkerHeartbeat, type ActiveJob, type WorkerHeartbeat } from '@/lib/queues/overview'
```

E il messaggio per il worker assente:

```tsx
            No data from the worker. It hasn&apos;t published a heartbeat yet, or it&apos;s
            been down for more than a minute.
```
diventa:
```tsx
            No worker is connected right now. Uploads wait in line until one starts.
```

- [ ] **Passo 10: togliere il vecchio e Upstash**

```bash
git rm lib/worker-heartbeat.ts lib/worker-heartbeat.test.ts
npm uninstall @upstash/redis
git grep -n -i "upstash" -- app lib components
```
Atteso dall'ultimo comando: solo un commento in `lib/routes-data.ts` (riga con «durable, near-permanent Upstash cache»). Sostituire «Upstash cache» con «Redis cache» in quel commento.

In `.env.local.example`:

```bash
python - <<'EOF'
import re, pathlib
p = pathlib.Path('.env.local.example')
s = p.read_text(encoding='utf-8')
lines = [l for l in s.split('\n') if not l.startswith(('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'))]
text = '\n'.join(lines).rstrip('\n') + '\n\n# The VM\'s Redis (cache and media queues). Leave it empty locally: everything that uses it then does nothing.\nREDIS_URL=\n'
p.write_text(text, encoding='utf-8')
EOF
git diff --stat .env.local.example
```

- [ ] **Passo 11: far passare tutto**

Run: `npx vitest run`
Atteso: PASS (tutta la suite; i test di integrazione e di ffmpeg sono saltati se mancano Redis o ffmpeg).

Run: `npm run typecheck && npm run lint`
Atteso: nessun errore. Un errore su un file che importava `@/lib/worker-heartbeat` o `jobKey` / `parseStatus` indica un consumatore dimenticato: aggiornarlo.

Run: `npm run build`
Atteso: la build finisce (richiede `.env.local`). Se si lamenta di `bullmq` o `ioredis`, controllare `serverExternalPackages` in `next.config.ts` (compito 4).

- [ ] **Passo 12: commit e PR 3**

```bash
git add -A lib components app .env.local.example package.json package-lock.json
git commit -m "The site reads status from the queue, confirms uploads to it and uses the VM's Redis"
git push -u origin feat/node-worker-wiring
gh pr create --base staging --head feat/node-worker-wiring --title "The site moves to the new queue and the VM's Redis" --body "Collegamento del sito (compito 14 del piano). Da unire solo dopo che Redis e il worker di staging sono accesi (compito 16, parte 1)."
```
**Non unirla ancora** se Redis e il worker di `staging` non sono già in funzione.

---

### Compito 15: Confronto con Python sulle foto vere

Prima di toccare un ambiente vivo si misura che `sharp` produca foto equivalenti a quelle di Pillow, **senza ritoccare la qualità** (Kevin l'ha chiesto). Le soglie sono fissate qui, prima di guardare i numeri.

**File:**
- Crea: `worker/scripts/render-with-pillow.py`, `worker/parity.test.ts`, `docs/ai/ideas/node-worker-parity.md`
- Modifica: `package.json` (`ssim.js` in sviluppo)

**Interfacce:**
- Consuma: `renderPhoto`, `decodeHeic`, `isHeicKey`, `testImagingConfig`.
- Produce: il rapporto `docs/ai/ideas/node-worker-parity.md`.

**Soglie** (per ogni foto di prova): stesse dimensioni di master, anteprima e tre versioni; peso del master di `sharp` fra 0,85 e 1,15 volte quello di Pillow; somiglianza strutturale media (SSIM) master contro master ≥ 0,985. Se una soglia non regge, **non si cambia `IMAGE_QUALITY`**: si prova prima `IMAGE_EFFORT` (e si annota), e se non basta si decide con Kevin.

- [ ] **Passo 1: scegliere le foto**

Servono una decina di sorgenti reali. Prenderle dal database di sviluppo, dalle foto **antecedenti al worker** (sono JPEG, PNG o WebP originali, non master):

```sql
select storage_key from media
where media_type = 'photo' and storage_key not like 'private/%' and storage_key not like '%.avif'
limit 8;
```
(da eseguire con l'MCP `supabase-dev`, `execute_sql`). Scaricarle da `$NEXT_PUBLIC_R2_PUBLIC_URL/<chiave>` in `temp/parity/`. Aggiungere `worker/fixtures/sample.heic`, la foto verticale dell'iPhone del compito 1 e un PNG con trasparenza (si ottiene con `sharp` come nei test). `temp/` è fuori da git.

- [ ] **Passo 2: produrre le uscite di Pillow**

```bash
gh repo clone lelettricaleoni/videoStream-bucketWorker "$TEMP/old-worker"   # se non c'è già
pip install Pillow pillow-heif
python worker/scripts/render-with-pillow.py "$TEMP/old-worker" temp/parity temp/parity-pillow
```

```python
# worker/scripts/render-with-pillow.py
"""
Renders every photo in a folder with the Python worker's own imaging.render_master(), for comparison with the Node worker.

    python worker/scripts/render-with-pillow.py <old worker folder> <photos folder> <output folder>
"""
import pathlib
import sys

old, photos, out = (pathlib.Path(arg) for arg in sys.argv[1:4])
sys.path.insert(0, str(old))
import imaging  # noqa: E402  (needs Pillow and pillow-heif)

for source in sorted(photos.iterdir()):
    if source.suffix.lower().lstrip(".") not in imaging.ALLOWED_EXTENSIONS:
        continue
    target = out / source.stem
    target.mkdir(parents=True, exist_ok=True)
    renditions = {width: str(target / f"w{width}.avif") for width in imaging.RENDITION_WIDTHS}
    size = imaging.render_master(str(source), str(target / "master.avif"), str(target / "share.jpg"), renditions)
    print(source.name, size)
```
Atteso: una riga con nome e dimensioni per ogni foto.

- [ ] **Passo 3: il confronto**

```bash
npm install -D ssim.js
```

```ts
// worker/parity.test.ts
// A measurement, not a regression test: it compares what this worker makes with what the Python worker made from the same
// photos, and writes a report. Skipped unless PARITY_DIR is set.
//
//   PARITY_DIR=temp/parity PARITY_PILLOW=temp/parity-pillow PARITY_REPORT=docs/ai/ideas/node-worker-parity.md \
//     npx vitest run worker/parity.test.ts
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { ssim } from 'ssim.js'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { decodeHeic, isHeicKey } from './heic'
import { renderPhoto } from './imaging'
import { testImagingConfig } from './testing/images'

const photos = process.env.PARITY_DIR
const pillow = process.env.PARITY_PILLOW
const report = process.env.PARITY_REPORT

const SIZE_RATIO = { min: 0.85, max: 1.15 }
const MIN_SSIM = 0.985

async function rgba(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

describe.skipIf(!photos || !pillow)('Node against Pillow, on the same photos', () => {
  it('stays within the thresholds fixed beforehand', async () => {
    const rows: string[] = []
    const failures: string[] = []
    const scratch = await mkdtemp(join(tmpdir(), 'parity-'))
    try {
      for (const file of (await readdir(photos!)).sort()) {
        const name = parse(file).name
        const reference = join(pillow!, name)
        const out = {
          master: join(scratch, `${name}-master.avif`),
          share: join(scratch, `${name}-share.jpg`),
          renditions: { 480: join(scratch, `${name}-480.avif`), 960: join(scratch, `${name}-960.avif`), 1600: join(scratch, `${name}-1600.avif`) },
        }
        const source = join(photos!, file)
        const input = isHeicKey(file) ? await decodeHeic(await readFile(source)) : source
        await renderPhoto(input, out, testImagingConfig)

        const [mine, theirs] = [await sharp(out.master).metadata(), await sharp(join(reference, 'master.avif')).metadata()]
        const sameSize = mine.width === theirs.width && mine.height === theirs.height
        const bytes = (await readFile(out.master)).length / (await readFile(join(reference, 'master.avif'))).length
        const score = ssim(await rgba(out.master), await rgba(join(reference, 'master.avif'))).mssim

        rows.push(`| ${file} | ${mine.width}×${mine.height} | ${theirs.width}×${theirs.height} | ${bytes.toFixed(2)} | ${score.toFixed(4)} |`)
        if (!sameSize) failures.push(`${file}: size differs`)
        if (bytes < SIZE_RATIO.min || bytes > SIZE_RATIO.max) failures.push(`${file}: weight ratio ${bytes.toFixed(2)}`)
        if (score < MIN_SSIM) failures.push(`${file}: SSIM ${score.toFixed(4)}`)
      }
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }

    if (report) {
      await writeFile(
        report,
        `# Node against Pillow, photo by photo\n\nThresholds fixed beforehand: same size; master weight between ${SIZE_RATIO.min} and ${SIZE_RATIO.max} times Pillow's; SSIM ≥ ${MIN_SSIM}.\n\n| Photo | Node | Pillow | Weight ratio | SSIM |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n${failures.length ? '**Out of threshold:**\n\n' + failures.map((f) => `- ${f}`).join('\n') : 'All within the thresholds.'}\n`,
      )
    }
    expect(failures).toEqual([])
  }, 600_000)
})
```

```bash
PARITY_DIR=temp/parity PARITY_PILLOW=temp/parity-pillow PARITY_REPORT=docs/ai/ideas/node-worker-parity.md npx vitest run worker/parity.test.ts
```
Atteso: PASS e il rapporto scritto. **Se fallisce**: aprire il rapporto, guardare le foto in questione a occhio, e seguire la regola sopra; non abbassare le soglie per far passare.

- [ ] **Passo 4: i video**

I parametri di ffmpeg sono già identici per costruzione (il compito 9 li confronta con il file generato da Python). La verifica sul video vero si fa su `staging` (compito 16, parte 2): stesso `master.m3u8` per struttura, quattro `#EXT-X-STREAM-INF`, segmenti da circa 4 secondi.

- [ ] **Passo 5: commit**

```bash
git add worker/scripts/render-with-pillow.py worker/parity.test.ts docs/ai/ideas/node-worker-parity.md package.json package-lock.json
git commit -m "Measure the Node photo output against Pillow's, on real photos"
```

---

### Compito 16: `staging` sulla VM

Operazioni sulla VM e prove dal vivo. Le parti 1 e 2 sono separate dalla PR 3 del compito 14: la parte 1 viene prima di unire le PR 2 e 3, la parte 2 dopo.

**Interfacce:**
- Consuma: i file di `deploy/` (compito 13), la chiave di deploy su GitHub.
- Produce: Redis acceso, il worker Node su `staging` (bucket di sviluppo), il sito di `staging` sul nuovo sistema, Python ristretto al bucket di produzione.

#### Parte 1: la VM (prima di unire la PR 2)

- [ ] **Passo 1: copiare i file**

```bash
ssh clustrenode1 'mkdir -p ~/docker/redis ~/docker/media-worker'
scp deploy/redis/compose.yml deploy/redis/redis.conf deploy/redis/users.acl.template deploy/redis/render-acl.sh clustrenode1:docker/redis/
scp deploy/worker/deploy.sh deploy/worker/make-env.sh deploy/worker/env.template clustrenode1:docker/media-worker/
scp deploy/deploy-entry.sh clustrenode1:docker/
ssh clustrenode1 'chmod 755 ~/docker/deploy-entry.sh ~/docker/media-worker/deploy.sh ~/docker/media-worker/make-env.sh ~/docker/redis/render-acl.sh && ls -l ~/docker ~/docker/redis ~/docker/media-worker'
```

- [ ] **Passo 2: accendere Redis**

```bash
ssh clustrenode1 'cd ~/docker/redis && ./render-acl.sh && docker compose up -d && sleep 6 && docker compose ps'
```
Atteso: `redis` è `healthy`; i file `users.acl`, `web.redis-url` e `worker.redis-url` esistono (`ls -l`), i due `.redis-url` con permessi 600.

- [ ] **Passo 3: i file delle variabili, senza stampare segreti**

```bash
ssh clustrenode1 'printf "REDIS_URL=%s\n" "$(cat ~/docker/redis/web.redis-url)" >> ~/docker/web/staging.env && ~/docker/media-worker/make-env.sh staging && awk -F= "/^REDIS_URL=/{print \"web staging.env: REDIS_URL presente\"}" ~/docker/web/staging.env && grep -c "" ~/docker/media-worker/staging.env && grep -E "^(R2_BUCKETS)=" ~/docker/media-worker/staging.env'
```
Atteso: `R2_BUCKETS=dev-lelettrica-trails` (il bucket di sviluppo), 5 righe nel file del worker.

- [ ] **Passo 4: la chiave di deploy passa dall'ingresso unico**

```bash
ssh clustrenode1 'cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%Y%m%d%H%M) && sed -i "s#command=\"/home/ubuntu/docker/web/deploy.sh\"#command=\"/home/ubuntu/docker/deploy-entry.sh\"#" ~/.ssh/authorized_keys && grep -c deploy-entry ~/.ssh/authorized_keys'
```
Atteso: `1`. Si prova subito che la forma vecchia funziona ancora, rilanciando il deploy del sito:

```bash
gh workflow run deploy.yml --ref staging
```
Atteso: la corsa finisce con successo (è lo stesso comando di prima, ora smistato).

- [ ] **Passo 5: Python serve solo il bucket di produzione**

```bash
ssh clustrenode1 'grep "^R2_BUCKETS=" ~/docker/worker/.env'
```
Atteso: i due bucket, sviluppo e produzione. Poi:

```bash
ssh clustrenode1 'cd ~/docker/worker && cp .env .env.bak-$(date +%Y%m%d%H%M) && sed -i "s/^R2_BUCKETS=.*/R2_BUCKETS=lelettrica-trails/" .env && docker compose up -d && sleep 8 && docker logs --tail 12 video-worker'
```
Atteso: il container è stato ricreato e i log non nominano più `dev-lelettrica-trails`.

- [ ] **Passo 6: unire le PR 2 e 3**

Con la VM pronta, unire (in background) la PR 2: parte `deploy-worker.yml` su `staging`. Controllare:

```bash
gh run list --workflow deploy-worker.yml --limit 2
ssh clustrenode1 'docker ps --filter label=lelettrica.worker --format "{{.Names}}\t{{.Status}}"; docker logs --tail 15 $(docker ps -q --filter label=lelettrica.worker=staging)'
```
Atteso: `media-worker-staging-…` è `healthy`, e il log termina con `worker started` con `prefix: bullmq-staging` e `buckets: ["dev-lelettrica-trails"]`. Poi unire la PR 3: parte il deploy del sito di `staging`.

#### Parte 2: prove dal vivo su `staging`

Tutte si giudicano **sul contenuto**, non sul codice HTTP. I file del bucket di sviluppo si leggono dal suo dominio pubblico (`https://dev-trails-bucket.lelettricaleoni.com/…`).

- [ ] **Passo 7: il pannello vede il worker**

Aprire `https://staging.lelettricaleoni.com/manage/dev`: la sezione «Video worker» mostra le tre code (`video-transcode`, `image-process`, `image-renditions`) e il carico della macchina; **non** il messaggio «No worker is connected».

- [ ] **Passo 8: i caricamenti veri** (li fa Kevin dal pannello di `staging`, su un percorso di prova)

Caricare, uno alla volta, e per ciascuno guardare la barra di avanzamento nel pannello e poi i file:

| Caricamento | Cosa deve succedere |
|---|---|
| un JPEG qualunque | barra fino a «done»; `…/<uuid>.avif`, `.w480/.w960/.w1600.avif` e `.share.jpg` esistono; il sorgente in `private/` non c'è più |
| un PNG con trasparenza | l'anteprima `.share.jpg` ha lo sfondo bianco, il master conserva la trasparenza |
| una foto **verticale dell'iPhone** (HEIC) | master in verticale e non specchiato; apre nel pannello |
| un MP4 con audio, corto | `master.m3u8` con quattro `#EXT-X-STREAM-INF`, quattro cartelle con `playlist.m3u8` e segmenti da circa 4 s; il video si riproduce nella pagina del percorso |
| un MP4 **senza audio** | gli stessi quattro livelli |

Controlli da riga di comando, per un `<uuid>` dato:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}B\n" https://dev-trails-bucket.lelettricaleoni.com/public/route-photos/<percorso>/<uuid>.avif
curl -s https://dev-trails-bucket.lelettricaleoni.com/public/route-videos/<percorso>/<uuid>/master.m3u8 | grep -c EXT-X-STREAM-INF
curl -s -o /dev/null -w "%{http_code}\n" https://dev-trails-bucket.lelettricaleoni.com/private/route-photos/<percorso>/<uuid>.<ext>
```
Atteso: `200 image/avif …`; `4`; e per il sorgente un `404` (il dominio pubblico espone tutto il bucket, quindi il 404 prova che è stato cancellato).

- [ ] **Passo 9: il worker ucciso a metà**

Durante la transcodifica di un video un po' più lungo:

```bash
ssh clustrenode1 'docker kill --signal SIGKILL $(docker ps -q --filter label=lelettrica.worker=staging)'
```
Atteso: Docker riavvia il container (`--restart unless-stopped`); il lavoro riprende (il sorgente era ancora su R2) e finisce; nessun file a metà sul bucket (il manifesto va su per ultimo).

- [ ] **Passo 10: Redis spento durante un caricamento**

```bash
ssh clustrenode1 'docker stop redis'
```
Caricare una foto dal pannello: **il caricamento non deve dare errore** (il sito non riesce a accodare ma non lo fa notare). Poi:

```bash
ssh clustrenode1 'docker start redis && sleep 15 && docker restart $(docker ps -q --filter label=lelettrica.worker=staging)'
```
Atteso: al riavvio la scansione iniziale trova la foto e la elabora (senza il riavvio ci vorrebbero fino a 10 minuti).

- [ ] **Passo 11: i tempi del sito**

Rifare la misura di sempre su `staging` (sul nome vero), 10 richieste per pagina, scartando la prima:

```bash
for p in /it /it/bikes /it/routes; do for i in $(seq 1 10); do curl -s -o /dev/null -w "%{time_starttransfer}\n" "https://staging.lelettricaleoni.com$p"; done | awk -v p="$p" 'NR>1{a+=$1;c++} END{printf "%s TTFB medio %.0f ms\n", p, a/c*1000}'; done
```
Atteso: nell'ordine di quelli di produzione sulla VM (232, 233 e 250 ms). Se peggiorano in modo netto, la cache su Redis non sta funzionando (guardare i log del sito per `[cache]`) e **non si procede**.

- [ ] **Passo 12: annotare l'esito**

Aggiungere in `docs/ai/ideas/node-worker-parity.md` una sezione «Prove su staging» con data e risultato di ogni riga dei passi 7-11.

---

### Compito 17: Produzione, congedo di Python e documentazione

Si fa in un momento in cui **nessun caricamento è in corso** (lo decide Kevin). L'ordine è pensato perché Python e Node non lavorino mai sullo stesso bucket: prima si ferma Python, poi si rilascia.

**Interfacce:**
- Consuma: tutto il resto; `DEPLOY_PRODUCTION=true` già acceso.
- Produce: il worker Node su produzione, Python spento ma pronto, la documentazione allineata.

- [ ] **Passo 1: prerequisiti, senza modifiche**

```bash
# Niente in coda né in corso nel worker Python (tre code, prefisso "bull")
ssh clustrenode1 'for q in video-transcode image-process image-renditions; do printf "%s: wait=%s active=%s delayed=%s\n" $q "$(docker exec worker-redis redis-cli llen bull:$q:wait)" "$(docker exec worker-redis redis-cli llen bull:$q:active)" "$(docker exec worker-redis redis-cli zcard bull:$q:delayed)"; done'
```
Atteso: tutti zero. Se no, aspettare. Inoltre Kevin conferma di non avere caricamenti in corso, e `/manage/dev` di `staging` mostra il worker Node in salute da almeno un giorno senza errori nei log.

- [ ] **Passo 2: preparare produzione, senza accendere niente**

```bash
ssh clustrenode1 'printf "REDIS_URL=%s\n" "$(cat ~/docker/redis/web.redis-url)" >> ~/docker/web/production.env && ~/docker/media-worker/make-env.sh production && grep -E "^R2_BUCKETS=" ~/docker/media-worker/production.env'
```
Atteso: `R2_BUCKETS=lelettrica-trails`. (Il vecchio codice del sito ignora `REDIS_URL`: è innocuo finché il rilascio non arriva.)

- [ ] **Passo 3: fermare Python, subito prima del rilascio**

```bash
ssh clustrenode1 'cd ~/docker/worker && docker compose stop video-worker && docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "worker|redis"'
```
Atteso: `video-worker` non c'è più fra i container in esecuzione; `worker-redis` resta. Da qui un caricamento aspetta: il sorgente resta su R2 e il Node lo prenderà.

- [ ] **Passo 4: il rilascio**

Aprire la PR `staging → main` e unirla **con merge commit** (mai squash), come per ogni rilascio. Parte il deploy del sito e, per i file toccati, quello del worker di produzione. Controllare:

```bash
gh run list --workflow deploy.yml --limit 2
gh run list --workflow deploy-worker.yml --limit 2
ssh clustrenode1 'docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "web-production|media-worker"; docker logs --tail 12 $(docker ps -q --filter label=lelettrica.worker=production)'
```
Atteso: `web-production-…` e `media-worker-production-…` `healthy`; il log del worker dice `prefix: bullmq-production` e `buckets: ["lelettrica-trails"]`.

- [ ] **Passo 5: provare in produzione sul contenuto**

- `https://www.lelettricaleoni.com/manage/dev` (da Kevin): il worker è collegato, le tre code ci sono.
- `https://www.lelettricaleoni.com/it/routes` e `/it/bikes`: stesse schede e stessi media di prima (`curl` e conteggio dei riferimenti `.avif` e `.m3u8`, come nel confronto del 2026-10-06).
- **Una foto e un breve video** da un percorso di prova non pubblicato: elaborati, con i file al loro posto e il sorgente cancellato; poi cancellare il percorso di prova (la cancellazione toglie anche i file).
- La sitemap: ancora 90 URL.

- [ ] **Passo 6: se qualcosa non va, tornare indietro**

```bash
ssh clustrenode1 'docker stop $(docker ps -q --filter label=lelettrica.worker=production) && cd ~/docker/worker && docker compose start video-worker'
```
Il Python torna a servire il bucket di produzione (la scansione ritrova i sorgenti). Il sito nuovo accoda nelle code `bullmq-production`, che Python ignora, ma la sua scansione ogni 30 secondi li prende lo stesso: nulla si perde.

- [ ] **Passo 7: documentazione** (una PR a parte)

Aggiornare:
- `docs/ai/STATE.md`: sostituire la sezione «**Il worker** (`lelettricaleoni/videoStream-bucketWorker`) sta in `~/docker/worker`…» (con la tabella e il paragrafo del deploy automatico del worker Python) con la descrizione del worker nuovo (`worker/`, immagine `Dockerfile.worker`, container `media-worker-<ambiente>`, coda `bullmq-<ambiente>`, un lavoro alla volta, scansione ogni 10 minuti, stato letto dalla coda, avvio dal sito con `confirmMediaUpload`, chiavi in `lib/media/keys.ts`); sostituire il paragrafo «**Cache di lettura su Upstash Redis**» con «Cache di lettura sul Redis della VM» (utenti `web` e `worker` con permessi limitati, `noeviction`, rete `internal`, nessuna porta); nella tabella «Ambienti» e nella sezione «Server» aggiungere Redis e il worker; togliere dal testo i riferimenti al token Upstash del worker.
- `docs/environment-variables.md`: sostituire le righe `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` con `REDIS_URL` (utente `web` per il sito, `worker` per il worker, file `~/docker/redis/*.redis-url`), aggiungere le variabili del worker (`deploy/worker/env.template`) e l'ambiente `ci`.
- `docs/ai/ROADMAP.md`: spostare il worker in Node da «Prossimo» a fatto (con la data); aggiungere la **fetta B** (pagina dei lavori, riprova, pausa, rielabora delle sole foto) come prossima voce, con il riferimento alla spec che andrà scritta; in «Pulizia di Vercel» aggiungere «cancellare il database Upstash e le variabili `UPSTASH_*`»; aggiungere in «Scartato» «**Conservare gli originali** (silo sulla VM, bucket privato, MinIO) — scartato da Kevin il 2026-10-06».
- `.claude/skills/media-storage/SKILL.md`: se descrive il worker Python, aggiornarla (chiavi in `lib/media/keys.ts`, lavori in `worker/jobs/`).

- [ ] **Passo 8: dopo una settimana tranquilla**

Con Kevin: archiviare (non cancellare) il repository `videoStream-bucketWorker` (`gh repo archive lelettricaleoni/videoStream-bucketWorker`), spegnere e togliere il container Python e il suo Redis (`cd ~/docker/worker && docker compose down -v`), e togliere la cartella `~/docker/worker`. Upstash si cancella con la pulizia di Vercel.

---

## Copertura della spec

| Sezione della spec | Compiti |
|---|---|
| Cosa non cambia: stesse chiavi e versioni | 2, 7, 8, 15 |
| Cosa non cambia: scala HLS invariata | 9 (file «golden» da Python) |
| Cosa non cambia: qualità AVIF 65, nessun ritocco | 6 (default), 7, 15 (soglie fissate prima) |
| La verità sta nello storage, sorgente cancellato dopo | 8, 9, 10 |
| Scartato: originali, worker nel sito, tenere Python | Spec e compito 17, passo 7 (ROADMAP) |
| Architettura: repository e immagine propria | 6-12 |
| Codice condiviso (chiavi, schemi, nomi) | 2, 3 |
| Redis: AOF, `noeviction`, utenti, rete interna, prefisso per ambiente | 3, 4, 13 |
| Stato dei lavori letto dalla coda; battito che sparisce | 5, 14 |
| Code, tentativi, completati/falliti conservati | 3, 11 |
| Avvio dei lavori dal sito; scansione ogni 10 minuti | 5, 10, 14 |
| Video: stessi argomenti, avanzamento, SHA-256, caricamento in parallelo, manifesti per ultimi | 9 |
| Foto: un decode, ICC, CMYK, 16 bit, limite pixel, master per ultimo | 7, 8 |
| HEIC: spike come primo compito, rinuncia dichiarata | 1, 7 |
| Priorità e arresto morbido, log JSON | 9 (`nice`), 11, 13 (`cpu-shares`, `stop-timeout`), 6 |
| Passaggio da Python a Node per ambiente, ritorno indietro | 16, 17 |
| Cosa cambia nel sito (`lib/redis.ts`, stato, `/manage/dev`, variabili, dipendenze) | 4, 5, 14 |
| CI: deploy filtrato per cartelle, ingresso unico | 13 |
| Prove: unitarie, integrazione con Redis vero, confronto con Python, dal vivo | 2-11, 15, 16 |
| Rischi | tabella della spec, coperti dai compiti 1, 7, 15, 16 |

**Raffinamenti emersi leggendo il codice, già riportati nella spec** (sezione «Raffinamenti emersi scrivendo il piano»):
1. Il sito non ha un «fine caricamento» lato server: il browser carica **direttamente su R2** e la riga `media` si scrive solo quando si salva il modulo. Per questo esiste la Server Action `confirmMediaUpload`, chiamata dal browser dopo il `PUT` riuscito.
2. Le code usano un **prefisso per ambiente** (`bullmq-staging`, `bullmq-production`), perché un solo Redis serve entrambi e un worker non deve prendere i lavori dell'altro.
3. Un video **senza audio** faceva rifiutare la mappa dei flussi a `ffmpeg` (il worker Python nominava sempre `a:0`): il worker controlla se la sorgente ha una traccia audio e, se non l'ha, non la nomina.
