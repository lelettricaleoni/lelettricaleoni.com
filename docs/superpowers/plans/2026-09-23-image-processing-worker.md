# Elaborazione immagini sul worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni foto caricata dal pannello (percorsi e modelli di bici) passa dal worker, che la trasforma in un unico master AVIF (lato massimo 2400 px), cancella il sorgente, ne pubblica lo SHA-256, e il sito mostra la foto solo quando il master esiste.

**Architecture:** Il browser carica la foto con un URL presigned in un prefisso di staging privato (`private/route-photos/…`, `private/bike-model-photos/…`), come già fa per i video. Un nuovo lavoro del worker Python, registrato accanto alla transcodifica, trova il lavoro elencando R2 (un sorgente senza master accanto *è* il lavoro), produce l'AVIF con Pillow, lo carica sotto `public/…` con estensione `.avif`, cancella il sorgente e scrive lo stato su Upstash con lo stesso contratto `videojob:v1:<storage-key>` dei video. Il sito deriva la chiave pubblica dalla chiave di staging, mostra solo ciò che esiste (come per i video), e tratta le foto vecchie — già pubbliche, senza `private/` — esattamente come prima.

**Tech Stack:** Python 3.12 (Alpine) · Pillow 12.3.0 + pillow-heif 1.8.0 · boto3 · BullMQ (worker, repo `C:\GitHub\videoStream-bucketWorker`) · Next.js 16 Server Actions · Vitest · React 19 (`MediaUpload`) · Cloudflare R2 · Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-09-23-image-processing-worker-design.md` — leggere **prima** la sezione "Corretto rispetto alla spec" qui sotto: sei punti della spec non reggono al confronto col codice e con la VM reale.

---

## Corretto rispetto alla spec

Ognuno di questi punti è stato verificato leggendo il codice o eseguendo il comando indicato, non dedotto.

1. **Le foto oggi NON vanno dritte su R2 con un URL presigned.** `components/admin/media-upload.tsx` le invia con `POST /api/upload` (multipart) a una route Vercel, che le hash-a e le scrive su R2 dopo il controllo duplicati. Le funzioni Vercel hanno un limite di 4,5 MB sul corpo della richiesta (limite documentato da Vercel, non misurato qui): **il TIF da 120 MB che ha originato tutto questo non passa nemmeno oggi da lì.** Conseguenze, tutte nel piano:
   - le foto passano al PUT presigned diretto a R2, come i video (`getPresignedUploadUrlAction` restituisce già `{url, key}`, oggi la foto ne ignora l'`url`);
   - l'avviso bloccante sui duplicati (spec `2026-09-21-upload-sha256`) **si sposta nel browser**: SHA-256 con `crypto.subtle` prima di caricare + una Server Action che cerca il duplicato. Lo SHA che il worker pubblica a fine lavoro resta come rete di sicurezza per i file troppo grandi da hashare nel browser (> 300 MB) e come contratto identico ai video;
   - `/api/upload` resta, ma **solo per il GPX** (lo usa `gpx-upload.tsx`); tenerlo aperto alle foto permetterebbe di saltare il worker.
2. **Lo stato usa `videojob:v1:<storage-key>`, non `imagejob:v1:`.** Il token Upstash del worker può fare `SET` solo su chiavi che iniziano per `videojob:` (`status.py`, STATE.md): una chiave `imagejob:` verrebbe rifiutata in silenzio (il worker registra un WARN e va avanti). La storage key dice già di che cosa si parla. **Le fasi sono quelle dei video, `transcoding` incluso** — la spec scriveva `processing`, ma `parseStatus` in `lib/video-jobs.ts` scarta qualsiasi fase che non conosce e un job scartato è indistinguibile da un job che nessuno ha toccato. **`lib/video-jobs.ts` non si rinomina**: rinominarlo tocca `worker-heartbeat`, i test e un contratto cross-repo senza cambiare un comportamento; si aggiorna il commento di testata e si aggiunge `isTrackedJobKey`. Si rinomina invece l'azione `getVideoJobStatuses` → `getMediaJobStatuses` e `recordVideoHashAction` → `recordMediaHashAction`, che hanno un solo importatore ciascuna.
3. **Pillow + pillow-heif, non ffmpeg.** Verificato (non supposto):
   - `pip download` per `musllinux_1_2_aarch64` e `musllinux_1_2_x86_64`, cp312: esistono i wheel di `Pillow 12.3.0` (con `libavif` incluso; AVIF nativo da 11.3) e `pillow-heif 1.8.0` (con libheif+libde265+x265). **Nessun compilatore, nessun `apk add`, il `Dockerfile` non cambia.**
   - Su `python:3.12-alpine` reale, **sia `linux/amd64` sia `linux/arm64`** (la VM è ARM64): `features.check("avif")` vero, encode/decode AVIF, alpha che sopravvive, TIFF (CMYK e 16 bit), HEIC, rotazione EXIF. 25 test verdi su entrambe le architetture; l'intera suite del worker (35 test con le parti nuove) è verde su amd64; il `Dockerfile` reale costruisce su arm64 e lo smoke test di `deploy.sh` (`import heartbeat, main, config, status, storage, jobs`) passa. Immagine: 386 MB.
   - Trappola trovata misurando: `Image.convert("RGB")` su un TIFF grigio a 16 bit (`I;16`) **satura tutto a bianco**. Il piano lo gestisce in `_to_encodable` e lo blocca con un test.
   - Tempi (rumore casuale, caso peggiore): 2400×1600 in 0,6 s su amd64; 6,7 s sotto qemu arm64 (quindi molto meno su una CPU vera).
4. **Vecchie e nuove foto si distinguono dalla chiave, senza migrare nulla.** Una chiave che inizia per `private/route-photos/` o `private/bike-model-photos/` è "in staging": il file pubblico è `public/<resto>.avif`. Ogni altra chiave (`route-photos/…`, `bike-model-photos/…`) è una foto pubblicata prima di questo lavoro e si serve com'è. Stessa regola su worker e sito, bloccata da coppie identiche nei test dei due repo.
5. **Cancellare `storageKey` non basta più.** `updateRouteAction`, `deleteRouteAction`, `updateBikeModelAction`, `deleteBikeModelAction` cancellano oggi solo `m.storageKey`: per una foto in staging lascerebbero il master AVIF su R2 per sempre. Un solo `deleteMediaFiles` sostituisce i quattro ternari duplicati.
6. **Il dropzone va esteso, e con un elenco esplicito.** Oggi `accept: { 'image/*': ['.jpg', '.jpeg', '.webp', '.png'] }` rifiuta TIF e HEIC (come dice la spec) — ma solo perché react-dropzone ≥ 20, quando un wildcard MIME è accoppiato a estensioni, scarta il wildcard e tiene le estensioni (letto in `node_modules/react-dropzone/dist/index.js`, `acceptPropAsAcceptAttr`; il repo dichiara `^20.1.2`). Nelle versioni precedenti lo stesso codice accettava qualunque immagine. Il piano sostituisce il wildcard con l'elenco esatto di ciò che il worker sa decodificare, che vale uguale in entrambe le semantiche, e aggiunge le estensioni `.tif/.tiff/.heic/.heif`: Chrome su Windows riporta `file.type === ''` per un HEIC, che quindi passa **solo** per estensione. Il `Content-Type` firmato nell'URL si deriva dall'estensione, non da `file.type`.

Due decisioni **non presenti nella spec**, con raccomandazione — se l'utente le boccia, i task indicati si saltano senza toccare gli altri:

- **D2 — JPEG per le anteprime social (task A3 e B7).** WhatsApp, Facebook e LinkedIn non leggono AVIF in `og:image` (da verificare con lo Sharing Debugger, task B10). Il sito ha un modal "condividi su WhatsApp" e `buildSocialMetadata` pubblica la foto di copertina come `og:image`: con un solo master AVIF le anteprime si romperebbero per ogni foto nuova. Il worker scrive anche un piccolo JPEG `….share.jpg` (1200 px), tagliato dai pixel del master, usato **solo** per `og:image` e JSON-LD. Contraddice "un unico master": costo ~30 righe e un oggetto in più per foto.
- **D3 — duplicati bloccanti nel browser (punto 1).** Alternativa scartata: farli diventare un avviso a posteriori come per i video (nessun hash nel browser). Perde l'avviso *prima* che i byte partano, che era il punto della spec 2026-09-21.

## Global Constraints

Valori copiati dalla spec e da CLAUDE.md; ogni task li eredita.

- Master **AVIF**, **lato massimo 2400 px** (mai upscale), qualità tarata sul campo (task A5, valore iniziale `IMAGE_QUALITY=65`, **non** un valore misurato).
- Formati in ingresso: `.jpg/.jpeg/.webp/.png` **più** `.tif/.tiff` e `.heic/.heif`.
- **Il sorgente viene cancellato dopo l'elaborazione**, e lo **SHA-256 si cattura prima di cancellarlo** (stesso contratto dei video: nello stato, una volta, insieme a `phase: 'done'`).
- Nessuna migrazione di schema: `media.storageKey` resta una singola chiave (privata per le foto nuove).
- Nessun cambiamento all'ottimizzazione di Next/Image; le foto già pubblicate restano dove sono.
- Una foto non ancora pronta **non compare** nelle pagine pubbliche, senza errore visibile — come un video non pronto.
- Il pannello mostra "in elaborazione" per le foto, riusando `lib/media-progress.ts` e il badge di `media-upload.tsx`.
- **Nessun dettaglio infrastrutturale nei testi visibili all'utente** (CLAUDE.md): niente "AVIF", "R2", "worker" nell'interfaccia del pannello. Ammesso: "Photos: JPG, PNG, WebP, TIFF or HEIC" (formati file, non infrastruttura).
- Codice, identificatori, commenti e testi del pannello admin **in inglese**; solo `messages/*.json` sono in lingua (questo lavoro non ne aggiunge).
- **Server Action, non route handler** per ciò che parte dal nostro client: le nuove azioni (`findDuplicateMediaAction`, `getMediaJobStatuses`) sono Server Action.
- Nessun CDN esterno, nessuna nuova dipendenza npm.
- **Mai commit diretti su `main`**: ogni repo lavora su un branch, apre una PR, e **nessun merge — né push a `main` — si fa senza l'utente**. Il worker fa **deploy automatico sulla VM di produzione a ogni push a `main`** (STATE.md, 2026-09-15): un merge lì è un deploy.

## Review Focus

Le classi di input che la spec non nomina e che più probabilmente fanno male a chi usa il sito. Ognuna ha il suo test nel task indicato.

1. **Sfondo trasparente** (il TIF del produttore, un PNG con alpha): non deve diventare nero. Master AVIF con alpha → A1 `test_transparency_survives`; JPEG social senza alpha → sfondo **bianco**, non nero → A3 `test_transparency_becomes_white_not_black`.
2. **TIFF grigio a 16 bit** (scansioni): non deve uscire bianco → A1 `test_sixteen_bit_greyscale_is_not_clipped_to_white`.
3. **File corrotto o che non è un'immagine** (un `.jpg` rinominato): il sorgente resta dov'è, non si pubblica un master a metà, e l'admin vede "failed" **solo all'ultimo tentativo** (i precedenti verranno ritentati) → A2 `test_a_file_that_is_not_an_image_…` e `test_an_early_failure_is_not_reported…`.
4. **Foto vecchia e foto non ancora pronta**: una foto pubblicata prima di questo lavoro si vede come prima, senza alcuna chiamata a R2; una foto in staging il cui master non esiste **non compare**; un "non ancora" **non viene mai messo in cache** (altrimenti resterebbe nascosta per sette giorni) → B2 `resolvePhotoUrl` e `resolveReadyMedia`.
5. **Cancellazione**: togliere una foto o cancellare un percorso/modello non deve lasciare su R2 il master AVIF (né il JPEG social) → B2 e B7 `deleteMediaFiles`.

Coperti anche, ciascuno dal proprio test: HEIC con `file.type` vuoto (`photoContentType`, B1), GIF/SVG/file senza estensione che non devono mai finire in staging (`photoSourceExtension`, B1, che è anche l'ultima difesa lato server + dropzone B5), foto iPhone ruotata via EXIF (A1), foto già più piccola di 2400 px (A1 `test_never_upscales`), file > 300 MB che non si possono hashare nel browser (`BROWSER_HASH_MAX_BYTES`, B3).

**Non coperto da test automatici** (dichiarato, non nascosto): `MediaUpload` come componente (nessun test di componenti admin nel repo), la CORS del bucket sul PUT dal browser (già esercitata dai video sullo stesso bucket), il worker vero sulla VM. Li copre il task B10, a mano.

## Ordine di esecuzione, dipendenze e coordinamento

```
A1 imaging.py ─→ A2 job + registro ─→ A3 JPEG social (D2) ─→ A4 CI ─→ A5 calibrazione ─→ A6 verifica + PR worker
                                                                                              │
B1 media-client ─→ B2 media.ts ─→ B3 progress/hash/job keys ─→ B4 azioni ─→ B5 MediaUpload    │
                                    ─→ B6 lettori pubblici ─→ B7 JPEG social (D2) ─→ B8 pulizia ─→ B9 docs ─→ B10 verifica live
```

Le due sezioni sono indipendenti fino al merge, e **il merge ha un ordine obbligato**:

1. **Prima il worker (Sezione A).** È additivo: la nuova coda guarda `private/route-photos/` e `private/bike-model-photos/`, dove oggi non c'è nulla. Il merge sul `main` del worker fa deploy automatico su produzione — **serve l'OK esplicito dell'utente**. Dopo il deploy, verificare nel log del container `INIT code: video-transcode, image-process` (o dalla pagina `/manage/dev`, che mostra da sola la nuova coda dal battito).
2. **Poi il sito (Sezione B).** Da quel momento ogni foto nuova va in staging: se il worker non c'è, resta invisibile.
3. **Rollback del sito** dopo il merge: le foto caricate nel frattempo hanno chiave `private/…`; il codice vecchio le renderebbe con `r2PublicUrl(chiave privata)` → 404. Prima di un eventuale revert, controllare `SELECT count(*) FROM media WHERE storage_key LIKE 'private/%photos/%'` su produzione.
4. Il sito parte da `main` aggiornato; la PR #154 (categorie percorso) tocca gli stessi due file di pagina (`app/[lang]/routes/[id]/page.tsx`, `app/[lang]/bikes/[id]/page.tsx`) e `lib/bikes-data.ts`, ma le ancore dei task B6/B7 sono locali e valgono prima e dopo.

Dipendenza di ambiente: il worker legge `R2_BUCKETS` dal proprio `.env` sulla VM. Se contiene solo il bucket di produzione, i test su Preview (bucket `dev-lelettrica-trails`) non vedranno mai un master. **Confermare con l'utente prima di A6** (domanda aperta 2).

## Domande aperte (servono all'utente prima o durante l'esecuzione)

1. **D2 — JPEG per le anteprime social:** lo vuoi? È fuori dalla spec ("un unico master"). Raccomandato sì; se no, si saltano A3 e B7 e il task B10 (step 4) verifica se serviva davvero.
2. **`R2_BUCKETS` sulla VM** (`~/docker/worker/.env`): include sia `lelettrica-trails` sia `dev-lelettrica-trails`? Se manca il bucket dev, i test su Preview non vedranno mai un master. Non ho accesso alla VM: serve un `grep R2_BUCKETS ~/docker/worker/.env` dell'utente.
3. **Foto vere per la calibrazione (A5):** il TIF da 120 MB del produttore, una foto di percorso, un HEIC da iPhone, un PNG con sfondo trasparente, in una cartella fuori dal repo. Senza, `IMAGE_QUALITY=65` resta un valore non misurato.
4. **Protezione di `main` sul repo del worker:** il workflow ora esegue i test anche sulle PR (job `test`). Renderlo un controllo obbligatorio per il merge è una scelta dell'utente sulle impostazioni GitHub del repo.
5. **Memoria della VM:** un TIFF da 120 MB decodificato è nell'ordine di centinaia di MB (il tetto impostato è 300 megapixel). Il worker ha concorrenza 1 *per coda*, ma ora le code sono due, quindi una transcodifica video e una foto possono girare insieme. La memoria totale si legge in `/manage/dev` (battito del worker): confermare che ce ne sia abbastanza prima del primo TIFF grande.
6. **D3 — duplicati bloccanti nel browser:** va bene spostare il controllo nel browser (alternativa: avviso a posteriori, come per i video)?

## Mappa dei file

**Repo worker** (`C:\GitHub\videoStream-bucketWorker`)

| File | Azione | Responsabilità |
|---|---|---|
| `imaging.py` | crea | Puro: mappatura chiavi, allowlist, `render_master`. Nessuno storage, nessuna coda |
| `jobs/image_process.py` | crea | `pending()`, `scan()`, `handle()` — l'impalcatura attorno a `imaging` |
| `jobs/__init__.py` | modifica | Una riga in `HANDLERS`, una in `PRODUCERS` |
| `requirements.txt` | modifica | `Pillow==12.3.0`, `pillow-heif==1.8.0` |
| `requirements-dev.txt` | crea | `-r requirements.txt` + `pytest` |
| `tests/conftest.py`, `tests/test_imaging.py`, `tests/test_image_process.py`, `tests/test_registry.py` | crea | Test |
| `scripts/calibrate.py` | crea | Tabella peso/tempo per qualità, su foto vere |
| `.github/workflows/build-push.yaml` | modifica | Job `test` davanti alla build |
| `.gitignore` | modifica | `.pytest_cache/`, `.venv/` |
| `Dockerfile`, `deploy.sh`, `main.py`, `status.py`, `storage.py`, `config.py`, `heartbeat.py` | **non cambiano** | Verificato: `COPY *.py` porta già `imaging.py`; lo smoke test importa `jobs` |

**Repo sito** (`C:\GitHub\lelettricaleoni.com`)

| File | Azione | Responsabilità |
|---|---|---|
| `lib/media-client.ts` | modifica | Puro, importabile dal client: staging, chiave pubblica, URL, estensioni, content type |
| `lib/media.ts` | modifica | `resolvePhotoUrl`, `resolveReadyMedia`, `getPhotoPresignedUploadUrl`, `deleteMediaFiles` |
| `lib/media-progress.ts` | modifica | Le foto hanno due metà come i video; opzione `awaiting` |
| `lib/video-jobs.ts` | modifica | `isTrackedJobKey`, commento di contratto |
| `lib/hash-client.ts` | crea | SHA-256 nel browser |
| `lib/actions/media-jobs.ts` | crea (sostituisce `video-jobs.ts`) | `getMediaJobStatuses` |
| `lib/actions/media-hash.ts` | modifica | `findDuplicateMediaAction`, `recordMediaHashAction` |
| `lib/actions/routes.ts`, `lib/actions/bike-models.ts` | modifica | Presign in staging, `deleteMediaFiles`, niente `savePhotosAction` |
| `components/admin/media-upload.tsx` | modifica | PUT presigned per tutti, hash prima del PUT, polling anche per le foto, dropzone esatto |
| `components/card-media.tsx`, `components/media-gallery.tsx`, `components/route-card-media-async.tsx`, `components/bike-card-media-async.tsx`, `lib/routes-data.ts`, `lib/bikes-data.ts`, `app/[lang]/routes/[id]/page.tsx`, `app/[lang]/bikes/[id]/page.tsx` | modifica | Tutti i punti che leggevano `r2PublicUrl(storageKey)` |
| `app/api/upload/route.ts` | modifica | Solo GPX |
| `components/admin/photo-upload.tsx`, `lib/actions/video-jobs.ts` | elimina | Codice morto / rinominato |
| `scripts/backfill-sha256.ts` | modifica | Salta le foto in staging |
| `.claude/skills/media-storage/SKILL.md`, `docs/ai/STATE.md` | modifica | Solo ciò che il codice non dice |
| `lib/media-client-photos.test.ts`, `lib/media.test.ts`, `lib/hash-client.test.ts` | crea | Test |
| `lib/media-progress.test.ts`, `lib/video-jobs.test.ts` | modifica | Test |

---

# Sezione A — Repo worker

Branch: `feat/image-processing` da `origin/main`. Prima di ogni commit: `git branch --show-current`. **Comando di test canonico** (stessa base dell'immagine di produzione, con Docker Desktop acceso; da eseguire nella root del repo worker):

```powershell
docker run --rm -v "${PWD}:/app" -w /app python:3.12-alpine sh -c "pip install -q --no-cache-dir --root-user-action=ignore -r requirements-dev.txt 2>&1 | grep -v notice; python -m pytest -q -p no:cacheprovider"
```

Aggiungere `--platform linux/arm64` per provare sulla stessa architettura della VM (lento sotto qemu, ma è l'unica prova vera prima del deploy).

### Task A1: `imaging.py` — chiavi, allowlist, `render_master`

**Files:**
- Create: `imaging.py`, `tests/conftest.py`, `tests/test_imaging.py`, `requirements-dev.txt`
- Modify: `requirements.txt`, `.gitignore`

**Interfaces:**
- Consumes: nulla.
- Produces (usati da A2/A3): `SOURCE_PREFIXES: tuple[str, ...]`, `ALLOWED_EXTENSIONS: set[str]`, `is_source_key(key: str) -> bool`, `output_key_for(source_key: str) -> str`, `render_master(src_path: str, dst_path: str) -> tuple[int, int]` (ritorna larghezza, altezza del master), `AVIF_QUALITY`, `MAX_EDGE`.

- [ ] **Step 1: Creare il branch e le dipendenze**

```powershell
Set-Location C:\GitHub\videoStream-bucketWorker
git fetch origin main
git checkout -b feat/image-processing origin/main
```

`requirements.txt` diventa:

```
boto3==1.43.91
bullmq==3.2.1
Pillow==12.3.0
pillow-heif==1.8.0
```

`requirements-dev.txt` (nuovo):

```
-r requirements.txt
pytest==9.0.2
```

`.gitignore` diventa:

```
__pycache__/
*.pyc
.pytest_cache/
.venv/
```

- [ ] **Step 2: Scrivere i test (falliranno)**

`tests/conftest.py`:

```python
import os
import sys

# The worker modules are flat files at the repo root, and storage.py builds its
# boto3 client the moment it is imported — a syntactically valid endpoint is
# enough for that, no request is ever made.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("R2_ENDPOINT", "https://example.invalid")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test")
```

`tests/test_imaging.py`:

```python
import pytest
from PIL import Image

import imaging


def avif(path):
    image = Image.open(path)
    image.load()
    return image


class TestKeys:
    # The same pairs lib/media-client-photos.test.ts pins in the website
    # repository. If one side changes and not the other, a photo is processed
    # into a place the site never looks.
    @pytest.mark.parametrize("source,expected", [
        ("private/route-photos/r1/u1.jpg", "public/route-photos/r1/u1.avif"),
        ("private/route-photos/r1/u1.HEIC", "public/route-photos/r1/u1.avif"),
        ("private/bike-model-photos/m1/u.2.tiff", "public/bike-model-photos/m1/u.2.avif"),
    ])
    def test_output_key(self, source, expected):
        assert imaging.output_key_for(source) == expected

    def test_output_key_rejects_a_public_key(self):
        with pytest.raises(ValueError):
            imaging.output_key_for("route-photos/r1/u1.jpg")

    @pytest.mark.parametrize("key", [
        "private/route-photos/r1/u1.jpg",
        "private/route-photos/r1/u1.JPEG",
        "private/route-photos/r1/u1.tif",
        "private/bike-model-photos/m1/u1.heif",
        "private/bike-model-photos/m1/u1.webp",
    ])
    def test_accepts_sources(self, key):
        assert imaging.is_source_key(key)

    @pytest.mark.parametrize("key", [
        "private/route-videos/r1/u1.mp4",
        "private/route-photos/r1/u1.gif",
        "private/route-photos/r1/u1.avif",
        "private/route-photos/r1/noextension",
        "public/route-photos/r1/u1.avif",
        "route-photos/r1/u1.jpg",
    ])
    def test_rejects_everything_else(self, key):
        assert not imaging.is_source_key(key)


class TestRender:
    def test_fits_the_long_edge_and_keeps_the_ratio(self, tmp_path):
        src, dst = tmp_path / "in.png", tmp_path / "out.avif"
        Image.new("RGB", (5000, 3000), (10, 120, 200)).save(src)
        assert imaging.render_master(str(src), str(dst)) == (2400, 1440)
        assert avif(dst).size == (2400, 1440)

    def test_never_upscales(self, tmp_path):
        src, dst = tmp_path / "in.png", tmp_path / "out.avif"
        Image.new("RGB", (800, 600)).save(src)
        assert imaging.render_master(str(src), str(dst)) == (800, 600)

    def test_output_is_avif(self, tmp_path):
        src, dst = tmp_path / "in.jpg", tmp_path / "out.avif"
        Image.new("RGB", (100, 100)).save(src)
        imaging.render_master(str(src), str(dst))
        assert avif(dst).format == "AVIF"

    def test_transparency_survives(self, tmp_path):
        # The manufacturer TIFF that started all this has a transparent
        # background: losing it would put a black box behind every bike.
        src, dst = tmp_path / "in.tif", tmp_path / "out.avif"
        image = Image.new("RGBA", (200, 100), (255, 0, 0, 255))
        for x in range(100):
            for y in range(100):
                image.putpixel((x, y), (0, 0, 0, 0))
        image.save(src)
        imaging.render_master(str(src), str(dst))
        out = avif(dst)
        assert out.mode == "RGBA"
        assert out.getpixel((10, 10))[3] == 0
        assert out.getpixel((150, 50))[3] == 255

    def test_palette_png_with_transparency_keeps_it(self, tmp_path):
        src, dst = tmp_path / "in.png", tmp_path / "out.avif"
        image = Image.new("P", (50, 50), 0)
        image.info["transparency"] = 0
        image.save(src, transparency=0)
        imaging.render_master(str(src), str(dst))
        assert avif(dst).mode == "RGBA"

    def test_exif_orientation_is_applied(self, tmp_path):
        # A phone photo is stored sideways with a tag saying so. AVIF written
        # without applying it would show the picture rotated.
        src, dst = tmp_path / "in.jpg", tmp_path / "out.avif"
        exif = Image.Exif()
        exif[0x0112] = 6  # rotate 90° clockwise to display
        Image.new("RGB", (400, 200), (1, 2, 3)).save(src, exif=exif)
        assert imaging.render_master(str(src), str(dst)) == (200, 400)

    def test_sixteen_bit_greyscale_is_not_clipped_to_white(self, tmp_path):
        src, dst = tmp_path / "in.tif", tmp_path / "out.avif"
        Image.new("I;16", (64, 64), 30000).save(src)
        imaging.render_master(str(src), str(dst))
        r, g, b = avif(dst).convert("RGB").getpixel((10, 10))
        assert 90 < r < 150  # 30000/65535 ≈ 46% grey, not 255

    def test_cmyk_tiff_is_converted(self, tmp_path):
        src, dst = tmp_path / "in.tif", tmp_path / "out.avif"
        Image.new("CMYK", (64, 64), (0, 0, 0, 0)).save(src)
        imaging.render_master(str(src), str(dst))
        assert avif(dst).mode in ("RGB", "RGBA")

    def test_heic_is_read(self, tmp_path):
        src, dst = tmp_path / "in.heic", tmp_path / "out.avif"
        Image.new("RGB", (120, 80), (200, 30, 30)).save(src, "HEIF")
        assert imaging.render_master(str(src), str(dst)) == (120, 80)

    def test_something_that_is_not_an_image_fails(self, tmp_path):
        src, dst = tmp_path / "in.jpg", tmp_path / "out.avif"
        src.write_bytes(b"this is not a photo")
        with pytest.raises(Exception):
            imaging.render_master(str(src), str(dst))
        assert not dst.exists()
```

- [ ] **Step 3: Eseguire i test e vedere il fallimento**

Comando canonico. Atteso: errore di collezione `ModuleNotFoundError: No module named 'imaging'`.

- [ ] **Step 4: Implementare `imaging.py`**

```python
"""
Photo processing: any accepted source in, one AVIF master out.

Pure by design — no storage, no queue, no network — so it can be tested with
nothing but Pillow. jobs/image_process.py owns the plumbing around it.

**The key mapping is a contract with lib/media-client.ts in the website
repository** (`photoPublicKey`). Change one and you must change the other; both
test suites pin the same pairs.
"""

import os

import pillow_heif
from PIL import Image, ImageOps, features

# HEIC/HEIF is what an iPhone produces. Registering the opener makes Image.open
# read it like any other format.
pillow_heif.register_heif_opener()

# Fail at import, not on the first photo: deploy.sh's smoke test imports every
# module against the real image before switching containers, so a Pillow built
# without its AVIF encoder stops the deploy instead of failing every upload.
if not features.check("avif"):
    raise RuntimeError("Pillow was built without AVIF support")

# A 120 MB manufacturer TIFF decodes to far more pixels than Pillow's default
# guard (~89 MP) accepts. Files reach this worker only through the admin panel,
# so the guard is raised, not removed: a decompression bomb still fails.
Image.MAX_IMAGE_PIXELS = 300_000_000

SOURCE_PREFIXES = ("private/route-photos/", "private/bike-model-photos/")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif"}

# Long edge of the master. Covers a retina screen at the largest size the site
# shows a photo (~992 CSS px). Never upscales: a smaller source keeps its size.
MAX_EDGE = int(os.environ.get("IMAGE_MAX_EDGE", "2400"))
# Starting point, to be settled by scripts/calibrate.py on real photos — not a
# measured optimum. Pillow's own default is 75.
AVIF_QUALITY = int(os.environ.get("IMAGE_QUALITY", "65"))
AVIF_SPEED = int(os.environ.get("IMAGE_SPEED", "6"))


def extension_of(key: str) -> str:
    return key.rsplit(".", 1)[-1].lower() if "." in key.rsplit("/", 1)[-1] else ""


def is_source_key(key: str) -> bool:
    """A staging object this worker should turn into a master."""
    return key.startswith(SOURCE_PREFIXES) and extension_of(key) in ALLOWED_EXTENSIONS


def output_key_for(source_key: str) -> str:
    """private/route-photos/{route}/{uuid}.jpg → public/route-photos/{route}/{uuid}.avif"""
    if not source_key.startswith("private/"):
        raise ValueError(f"not a staging key: {source_key}")
    stem = source_key[: source_key.rindex(".")] if "." in source_key.rsplit("/", 1)[-1] else source_key
    return "public/" + stem[len("private/"):] + ".avif"


def _to_encodable(im: Image.Image) -> Image.Image:
    """
    Bring whatever the decoder produced to something AVIF stores faithfully.

    16-bit greyscale needs its own path: `convert("RGB")` on an "I;16" image
    clips every value above 255, so a mid-grey scan comes out pure white.
    """
    if im.mode in ("RGB", "RGBA"):
        return im
    if im.mode.startswith("I;16") or im.mode == "I":
        return im.point(lambda v: v / 256, "L").convert("RGB")
    if im.mode in ("LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        return im.convert("RGBA")
    return im.convert("RGB")


def render_master(src_path: str, dst_path: str) -> tuple[int, int]:
    """Decode `src_path`, fit it in MAX_EDGE, write AVIF to `dst_path`. Returns the size."""
    with Image.open(src_path) as opened:
        if opened.format == "JPEG":
            # Lets the decoder skip work by decoding at a reduced scale; it
            # never goes below the requested size, so quality is unaffected.
            opened.draft("RGB", (MAX_EDGE, MAX_EDGE))
        oriented = ImageOps.exif_transpose(opened)
        # A profile describes RGB(A) data. After a CMYK→RGB conversion it would
        # describe the wrong thing, so it only travels with data that stays RGB.
        icc = oriented.info.get("icc_profile") if oriented.mode in ("RGB", "RGBA") else None
        image = _to_encodable(oriented)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        image.save(dst_path, "AVIF", quality=AVIF_QUALITY, speed=AVIF_SPEED, icc_profile=icc)
        return image.size
```

- [ ] **Step 5: Eseguire i test**

Comando canonico. Atteso: `25 passed`.

- [ ] **Step 6: Commit**

```powershell
git branch --show-current   # feat/image-processing
git add imaging.py tests requirements.txt requirements-dev.txt .gitignore
git commit -m "Add imaging.py: any accepted photo in, one AVIF master out"
```

### Task A2: `jobs/image_process.py` e registrazione

**Files:**
- Create: `jobs/image_process.py`, `tests/test_image_process.py`, `tests/test_registry.py`
- Modify: `jobs/__init__.py`

**Interfaces:**
- Consumes (da A1): `SOURCE_PREFIXES`, `is_source_key`, `output_key_for`, `render_master`. Da `jobs/transcode.py`: `sha256_of_file(path: str) -> str`. Da `status.py`: `apublish(subject, phase, *, progress=None, attempt=None, error=None, sha256=None)`. Da `storage.py`: `s3`, `list_keys`, `object_exists`.
- Produces: `QUEUE = "image-process"`, `pending() -> list[tuple[str, str]]`, `scan(queue, shutdown)`, `handle(job, _token=None)`. Le fasi pubblicate sono esattamente `downloading → transcoding → uploading → done | failed` (nomi dei video: vedi "Corretto" punto 2).

- [ ] **Step 1: Scrivere i test (falliranno)**

`tests/test_image_process.py`:

```python
import asyncio
import hashlib
from types import SimpleNamespace

import pytest
from PIL import Image

from jobs import image_process


class FakeS3:
    """Just enough of boto3's client: the calls the handler makes, recorded in order."""

    def __init__(self, source_bytes: bytes):
        self.source_bytes = source_bytes
        self.calls: list[tuple] = []
        self.uploaded: dict[str, bytes] = {}

    def download_file(self, bucket, key, dest):
        self.calls.append(("download", key))
        with open(dest, "wb") as f:
            f.write(self.source_bytes)

    def upload_file(self, path, bucket, key, ExtraArgs=None):
        self.calls.append(("upload", key, ExtraArgs))
        with open(path, "rb") as f:
            self.uploaded[key] = f.read()

    def delete_object(self, Bucket, Key):
        self.calls.append(("delete", Key))


@pytest.fixture
def statuses(monkeypatch):
    seen: list[tuple[str, str, dict]] = []

    async def fake_apublish(subject, phase, **kwargs):
        seen.append((subject, phase, kwargs))

    monkeypatch.setattr(image_process, "apublish", fake_apublish)
    return seen


@pytest.fixture
def workdir(monkeypatch, tmp_path):
    monkeypatch.setattr(image_process, "WORKDIR_BASE", str(tmp_path / "work"))
    return tmp_path / "work"


def png_bytes(tmp_path, size=(300, 200)) -> bytes:
    path = tmp_path / "source.png"
    Image.new("RGB", size, (20, 90, 160)).save(path)
    return path.read_bytes()


def job(key="private/route-photos/r1/u1.png", attempts_made=0):
    return SimpleNamespace(data={"bucket": "b", "key": key}, attemptsMade=attempts_made)


class TestPending:
    def test_a_source_without_a_master_is_work(self, monkeypatch):
        monkeypatch.setattr(image_process, "R2_BUCKETS", ["b"])
        listing = {
            "private/route-photos/": ["private/route-photos/r1/a.jpg", "private/route-photos/r1/b.jpg"],
            "private/bike-model-photos/": ["private/bike-model-photos/m1/c.tif"],
        }
        monkeypatch.setattr(image_process, "list_keys", lambda bucket, prefix: listing[prefix])
        done = {"public/route-photos/r1/b.avif"}
        monkeypatch.setattr(image_process, "object_exists", lambda bucket, key: key in done)

        assert image_process.pending() == [
            ("b", "private/route-photos/r1/a.jpg"),
            ("b", "private/bike-model-photos/m1/c.tif"),
        ]

    def test_ignores_what_it_cannot_process(self, monkeypatch):
        monkeypatch.setattr(image_process, "R2_BUCKETS", ["b"])
        monkeypatch.setattr(
            image_process, "list_keys",
            lambda bucket, prefix: [prefix + "r1/notes.txt", prefix + "r1/clip.mp4"],
        )
        monkeypatch.setattr(image_process, "object_exists", lambda bucket, key: False)
        assert image_process.pending() == []

    def test_a_bucket_that_cannot_be_listed_does_not_stop_the_others(self, monkeypatch):
        monkeypatch.setattr(image_process, "R2_BUCKETS", ["broken", "ok"])

        def listing(bucket, prefix):
            if bucket == "broken":
                raise RuntimeError("unreachable")
            return [prefix + "r1/a.jpg"] if prefix == "private/route-photos/" else []

        monkeypatch.setattr(image_process, "list_keys", listing)
        monkeypatch.setattr(image_process, "object_exists", lambda bucket, key: False)
        assert image_process.pending() == [("ok", "private/route-photos/r1/a.jpg")]


class TestHandle:
    def test_publishes_the_master_then_deletes_the_source(self, monkeypatch, statuses, workdir, tmp_path):
        source = png_bytes(tmp_path)
        fake = FakeS3(source)
        monkeypatch.setattr(image_process, "s3", fake)

        result = asyncio.run(image_process.handle(job()))

        assert result == {"width": 300, "height": 200}
        kinds = [c[0] for c in fake.calls]
        assert kinds == ["download", "upload", "delete"]  # never delete before the master is up
        assert fake.calls[1][1] == "public/route-photos/r1/u1.avif"
        assert fake.calls[1][2]["ContentType"] == "image/avif"
        assert "immutable" in fake.calls[1][2]["CacheControl"]
        assert fake.calls[2][1] == "private/route-photos/r1/u1.png"
        assert fake.uploaded["public/route-photos/r1/u1.avif"][4:12] == b"ftypavif"

    def test_reports_the_phases_the_website_understands_and_the_source_hash(
        self, monkeypatch, statuses, workdir, tmp_path
    ):
        source = png_bytes(tmp_path)
        monkeypatch.setattr(image_process, "s3", FakeS3(source))

        asyncio.run(image_process.handle(job()))

        assert [s[1] for s in statuses] == ["downloading", "transcoding", "uploading", "done"]
        assert {s[0] for s in statuses} == {"private/route-photos/r1/u1.png"}
        assert statuses[-1][2]["sha256"] == hashlib.sha256(source).hexdigest()

    def test_cleans_up_its_working_directory(self, monkeypatch, statuses, workdir, tmp_path):
        monkeypatch.setattr(image_process, "s3", FakeS3(png_bytes(tmp_path)))
        asyncio.run(image_process.handle(job()))
        assert [p for p in workdir.rglob("*") if p.is_file()] == []

    def test_a_file_that_is_not_an_image_keeps_its_source_and_says_so_on_the_last_attempt(
        self, monkeypatch, statuses, workdir
    ):
        fake = FakeS3(b"this is not a photo")
        monkeypatch.setattr(image_process, "s3", fake)

        with pytest.raises(Exception):
            asyncio.run(image_process.handle(job(attempts_made=image_process.MAX_ATTEMPTS - 1)))

        assert ("delete", "private/route-photos/r1/u1.png") not in fake.calls
        assert not any(c[0] == "upload" for c in fake.calls)
        assert statuses[-1][1] == "failed"
        assert statuses[-1][2]["error"]

    def test_an_early_failure_is_not_reported_because_it_will_be_retried(
        self, monkeypatch, statuses, workdir
    ):
        monkeypatch.setattr(image_process, "s3", FakeS3(b"this is not a photo"))
        with pytest.raises(Exception):
            asyncio.run(image_process.handle(job(attempts_made=0)))
        assert "failed" not in [s[1] for s in statuses]
```

`tests/test_registry.py`:

```python
def test_every_module_deploy_sh_smoke_tests_still_imports():
    # The same list deploy.sh imports against the real image before it switches
    # containers; failing here means failing there, after the build has been paid for.
    import config, heartbeat, jobs, main, status, storage  # noqa: F401


def test_photos_are_registered_beside_videos():
    import jobs
    from jobs import image_process, transcode

    assert set(jobs.HANDLERS) == {transcode.QUEUE, image_process.QUEUE}
    assert jobs.HANDLERS[image_process.QUEUE] is image_process.handle
    assert (image_process.QUEUE, image_process.scan) in jobs.PRODUCERS
    # One queue per kind of work: the runner starts a worker for each queue name.
    assert image_process.QUEUE != transcode.QUEUE
```

- [ ] **Step 2: Eseguire e vedere il fallimento**

Comando canonico. Atteso: `ImportError: cannot import name 'image_process' from 'jobs'`.

- [ ] **Step 3: Implementare `jobs/image_process.py`**

```python
"""
Photo processing: any accepted upload in, one AVIF master out.

Sources come from R2 under private/route-photos/ and private/bike-model-photos/;
the master goes to the matching public/ key with an .avif extension, after which
the source is deleted. What "matching" means lives in imaging.output_key_for.

Same principle as jobs/transcode.py, and for the same reason: **the job list is
rebuilt, never stored.** A staging object with no master beside it *is* the work
to do. Redis holds the queue for retries and ordering, not the record of what
needs doing.

Status goes out under the same `videojob:v1:<storage-key>` keys the videos use —
the Upstash token this machine holds may only SET keys with that prefix, and the
storage key already says what kind of thing it is. The phase names are the
videos' too (`transcoding` included): the website's parser rejects any phase it
does not know, and a rejected status looks exactly like a job nobody has touched.
"""

import asyncio
import os
import shutil

from bullmq import Queue

from config import R2_BUCKETS, WORKDIR_BASE, log
from imaging import SOURCE_PREFIXES, is_source_key, output_key_for, render_master
from status import apublish
from storage import list_keys, object_exists, s3
from .transcode import sha256_of_file

QUEUE = "image-process"
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "3"))
SCAN_INTERVAL_S = int(os.environ.get("SCAN_INTERVAL_S", "30"))

# The output name carries the source's uuid, which never repeats, so a browser or
# CDN may keep the file for as long as it likes.
MASTER_CACHE_CONTROL = "public, max-age=31536000, immutable"


def pending() -> list[tuple[str, str]]:
    """(bucket, key) of every staging photo with no master beside it."""
    out: list[tuple[str, str]] = []
    for bucket in R2_BUCKETS:
        for prefix in SOURCE_PREFIXES:
            try:
                sources = list_keys(bucket, prefix)
            except Exception as exc:
                log("ERROR", f"elenco di {bucket}/{prefix} fallito: {exc}")
                continue
            for key in sources:
                if is_source_key(key) and not object_exists(bucket, output_key_for(key)):
                    out.append((bucket, key))
    return out


async def scan(queue: Queue, shutdown: asyncio.Event) -> None:
    """Reconcile storage against the queue, forever. Registered as a producer."""
    while not shutdown.is_set():
        try:
            photos = await asyncio.to_thread(pending)
            for bucket, key in photos:
                # The job id is the object, so BullMQ refuses duplicates itself.
                await queue.add(
                    "process",
                    {"bucket": bucket, "key": key},
                    {
                        "jobId": f"{bucket}/{key}",
                        "attempts": MAX_ATTEMPTS,
                        "backoff": {"type": "exponential", "delay": 10_000},
                        "removeOnComplete": 100,
                        "removeOnFail": 500,
                    },
                )
            if photos:
                log("SCAN", f"{len(photos)} foto senza master accodate")
        except Exception as exc:
            log("ERROR", f"scansione fallita: {exc}")

        try:
            await asyncio.wait_for(shutdown.wait(), timeout=SCAN_INTERVAL_S)
        except asyncio.TimeoutError:
            pass


async def handle(job, _token=None):
    """The BullMQ handler for one photo."""
    bucket, key = job.data["bucket"], job.data["key"]
    out_key = output_key_for(key)
    attempt = job.attemptsMade + 1
    workdir = os.path.join(WORKDIR_BASE, bucket, key.replace("/", "_"))
    src = os.path.join(workdir, "input" + key[key.rindex("."):])
    dst = os.path.join(workdir, "master.avif")

    try:
        os.makedirs(workdir, exist_ok=True)

        await apublish(key, "downloading", attempt=attempt)
        log("DOWNLOAD", f"[{attempt}/{MAX_ATTEMPTS}] {bucket}/{key}")
        await asyncio.to_thread(s3.download_file, bucket, key, src)

        # Computed here for the same reason as for videos: this is the only
        # place the source exists outside R2, and it is deleted below.
        sha256 = await asyncio.to_thread(sha256_of_file, src)

        # One blocking call in a thread, so the loop stays free to renew the
        # job lock. It reports no percentage — there is nothing to measure.
        await apublish(key, "transcoding", attempt=attempt)
        width, height = await asyncio.to_thread(render_master, src, dst)
        log("RENDER", f"{bucket}/{key} → {width}x{height}")

        await apublish(key, "uploading", progress=99, attempt=attempt)
        await asyncio.to_thread(
            s3.upload_file, dst, bucket, out_key,
            ExtraArgs={"ContentType": "image/avif", "CacheControl": MASTER_CACHE_CONTROL},
        )

        # Only after the master is in place: a failure before this point leaves
        # the source where the next scan will find it.
        await asyncio.to_thread(s3.delete_object, Bucket=bucket, Key=key)
        await apublish(key, "done", progress=100, sha256=sha256)
        log("DONE", f"{bucket}/{out_key}")
        return {"width": width, "height": height}

    except Exception as exc:
        log("ERROR", f"tentativo {attempt}: {bucket}/{key}: {exc}")
        # Only the last attempt is a failure the admin should see.
        if attempt >= MAX_ATTEMPTS:
            await apublish(key, "failed", attempt=attempt, error=str(exc))
        raise
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
```

- [ ] **Step 4: Registrare il lavoro in `jobs/__init__.py`**

Sostituire questo blocco:

```python
from . import transcode

# queue name → handler
HANDLERS: dict[str, Callable[..., Awaitable[Any]]] = {
    transcode.QUEUE: transcode.handle,
}

# coroutines that enqueue work themselves: (queue name, coroutine)
PRODUCERS: list[tuple[str, Callable[..., Awaitable[None]]]] = [
    (transcode.QUEUE, transcode.scan),
]
```

con:

```python
from . import image_process, transcode

# queue name → handler
HANDLERS: dict[str, Callable[..., Awaitable[Any]]] = {
    transcode.QUEUE: transcode.handle,
    image_process.QUEUE: image_process.handle,
}

# coroutines that enqueue work themselves: (queue name, coroutine)
PRODUCERS: list[tuple[str, Callable[..., Awaitable[None]]]] = [
    (transcode.QUEUE, transcode.scan),
    (image_process.QUEUE, image_process.scan),
]
```

- [ ] **Step 5: Eseguire tutta la suite**

Comando canonico. Atteso: `35 passed`.

- [ ] **Step 6: Commit**

```powershell
git branch --show-current
git add jobs tests
git commit -m "Add the image-process job: staging photo in, AVIF master out, source deleted"
```

### Task A3: JPEG per le anteprime social (decisione D2 — saltabile)

> Se l'utente scarta D2, saltare A3 **e** B7: nient'altro dipende da loro.

**Files:**
- Modify: `imaging.py`, `jobs/image_process.py`, `tests/test_imaging.py`, `tests/test_image_process.py`

**Interfaces:**
- Consumes (da A1/A2): `render_master`, `output_key_for`, `handle`.
- Produces: `share_key_for(source_key: str) -> str` (`private/route-photos/{o}/{u}.jpg` → `public/route-photos/{o}/{u}.share.jpg`); `render_master(src_path, dst_path, share_path: str | None = None)`. **Il master si carica per ultimo**: `pending()` ne usa l'esistenza come marcatore di "finito", quindi non deve mai comparire prima del JPEG.

- [ ] **Step 1: Aggiornare i test (falliranno)**

In `tests/test_imaging.py`, prima di `class TestRender:` inserire:

```python
class TestShare:
    # Same pairs as photoShareKey in lib/media-client-photos.test.ts.
    @pytest.mark.parametrize("source,expected", [
        ("private/route-photos/r1/u1.jpg", "public/route-photos/r1/u1.share.jpg"),
        ("private/bike-model-photos/m1/u.2.tiff", "public/bike-model-photos/m1/u.2.share.jpg"),
    ])
    def test_share_key(self, source, expected):
        assert imaging.share_key_for(source) == expected

    def test_share_is_a_small_jpeg_cut_from_the_same_photo(self, tmp_path):
        src, dst, share = tmp_path / "in.png", tmp_path / "out.avif", tmp_path / "share.jpg"
        Image.new("RGB", (5000, 3000), (10, 120, 200)).save(src)
        assert imaging.render_master(str(src), str(dst), str(share)) == (2400, 1440)
        out = avif(share)
        assert out.format == "JPEG"
        assert out.size == (1200, 720)

    def test_transparency_becomes_white_not_black(self, tmp_path):
        src, dst, share = tmp_path / "in.png", tmp_path / "out.avif", tmp_path / "share.jpg"
        Image.new("RGBA", (200, 100), (0, 0, 0, 0)).save(src)
        imaging.render_master(str(src), str(dst), str(share))
        out = avif(share)
        assert out.mode == "RGB"
        assert min(out.getpixel((50, 50))) > 240

    def test_no_share_is_written_unless_asked_for(self, tmp_path):
        src, dst = tmp_path / "in.png", tmp_path / "out.avif"
        Image.new("RGB", (100, 100)).save(src)
        imaging.render_master(str(src), str(dst))
        assert list(tmp_path.glob("*.jpg")) == []


```

In `tests/test_image_process.py`, sostituire il primo test di `TestHandle`:

```python
        assert result == {"width": 300, "height": 200}
        kinds = [c[0] for c in fake.calls]
        # The master is the readiness marker, so it goes up after the preview,
        # and the source is only deleted once both are in place.
        assert kinds == ["download", "upload", "upload", "delete"]
        assert fake.calls[1][1] == "public/route-photos/r1/u1.share.jpg"
        assert fake.calls[1][2]["ContentType"] == "image/jpeg"
        assert fake.calls[2][1] == "public/route-photos/r1/u1.avif"
        assert fake.calls[2][2]["ContentType"] == "image/avif"
        assert "immutable" in fake.calls[2][2]["CacheControl"]
        assert fake.calls[3][1] == "private/route-photos/r1/u1.png"
        assert fake.uploaded["public/route-photos/r1/u1.avif"][4:12] == b"ftypavif"
        assert fake.uploaded["public/route-photos/r1/u1.share.jpg"][:3] == b"\xff\xd8\xff"
```

(al posto delle righe da `assert result == …` a `assert fake.uploaded[…][4:12] == b"ftypavif"`).

- [ ] **Step 2: Eseguire e vedere il fallimento** — comando canonico; atteso `AttributeError: module 'imaging' has no attribute 'share_key_for'`.

- [ ] **Step 3: Modificare `imaging.py`**

Dopo `AVIF_SPEED = …` aggiungere:

```python

# WhatsApp, Facebook and LinkedIn build a link preview from a page's og:image and
# do not read AVIF. Each photo therefore also gets a small JPEG, used only for
# that. It is cut from the master's pixels, not decoded again from the source.
SHARE_EDGE = int(os.environ.get("IMAGE_SHARE_EDGE", "1200"))
SHARE_QUALITY = int(os.environ.get("IMAGE_SHARE_QUALITY", "82"))
```

Prima di `def _to_encodable` aggiungere:

```python
def share_key_for(source_key: str) -> str:
    """private/route-photos/{route}/{uuid}.jpg → public/route-photos/{route}/{uuid}.share.jpg"""
    return output_key_for(source_key)[: -len(".avif")] + ".share.jpg"


```

Sostituire l'intera `render_master` con:

```python
def _save_share(image: Image.Image, icc: bytes | None, dst_path: str) -> None:
    share = image.copy()
    share.thumbnail((SHARE_EDGE, SHARE_EDGE), Image.Resampling.LANCZOS)
    if share.mode == "RGBA":
        # JPEG has no alpha: a transparent background would turn black.
        flat = Image.new("RGB", share.size, (255, 255, 255))
        flat.paste(share, mask=share.getchannel("A"))
        share = flat
    share.save(dst_path, "JPEG", quality=SHARE_QUALITY, optimize=True, icc_profile=icc)


def render_master(src_path: str, dst_path: str, share_path: str | None = None) -> tuple[int, int]:
    """
    Decode `src_path`, fit it in MAX_EDGE, write AVIF to `dst_path`, and — when
    `share_path` is given — the link-preview JPEG too. Returns the master's size.
    """
    with Image.open(src_path) as opened:
        if opened.format == "JPEG":
            # Lets the decoder skip work by decoding at a reduced scale; it
            # never goes below the requested size, so quality is unaffected.
            opened.draft("RGB", (MAX_EDGE, MAX_EDGE))
        oriented = ImageOps.exif_transpose(opened)
        # A profile describes RGB(A) data. After a CMYK→RGB conversion it would
        # describe the wrong thing, so it only travels with data that stays RGB.
        icc = oriented.info.get("icc_profile") if oriented.mode in ("RGB", "RGBA") else None
        image = _to_encodable(oriented)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        image.save(dst_path, "AVIF", quality=AVIF_QUALITY, speed=AVIF_SPEED, icc_profile=icc)
        if share_path:
            _save_share(image, icc, share_path)
        return image.size
```

- [ ] **Step 4: Modificare `jobs/image_process.py`**

Import: `from imaging import SOURCE_PREFIXES, is_source_key, output_key_for, render_master, share_key_for`.

In `handle`, dopo `out_key = output_key_for(key)` aggiungere `share_key = share_key_for(key)`; dopo `dst = os.path.join(workdir, "master.avif")` aggiungere `share_dst = os.path.join(workdir, "share.jpg")`; sostituire la chiamata a `render_master` con:

```python
        width, height = await asyncio.to_thread(render_master, src, dst, share_dst)
```

e sostituire il blocco `await asyncio.to_thread(s3.upload_file, dst, …)` con:

```python
        # The master goes last: pending() takes its existence to mean the photo
        # is finished, so nothing may look ready while the preview is missing.
        await asyncio.to_thread(
            s3.upload_file, share_dst, bucket, share_key,
            ExtraArgs={"ContentType": "image/jpeg", "CacheControl": MASTER_CACHE_CONTROL},
        )
        await asyncio.to_thread(
            s3.upload_file, dst, bucket, out_key,
            ExtraArgs={"ContentType": "image/avif", "CacheControl": MASTER_CACHE_CONTROL},
        )
```

- [ ] **Step 5: Eseguire la suite** — atteso `40 passed`.

- [ ] **Step 6: Commit**

```powershell
git branch --show-current
git add imaging.py jobs tests
git commit -m "Write a small JPEG beside each master, for link previews that cannot read AVIF"
```

### Task A4: job `test` nella CI del worker

Oggi il workflow **non esegue nessun test**: un push a `main` costruisce e distribuisce. Da qui in poi i test bloccano la build.

**Files:**
- Modify: `.github/workflows/build-push.yaml`

- [ ] **Step 1: Aggiungere trigger e job**

Nella sezione `on:` aggiungere, dopo `push:`, il trigger di PR (solo i test girano su una PR; build e deploy restano solo su `main`):

```yaml
  pull_request:
    paths:
      - "**.py"
      - "requirements.txt"
      - "requirements-dev.txt"
      - "Dockerfile"
```

Sotto `jobs:`, prima di `build-push:`, aggiungere:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: |
            requirements.txt
            requirements-dev.txt

      - name: Install
        run: pip install -r requirements-dev.txt

      - name: Test
        run: python -m pytest -q

```

e a `build-push:` aggiungere subito sotto il nome del job:

```yaml
    needs: test
    if: github.event_name != 'pull_request'
```

Il job `deploy` ha già `needs: build-push` e `if: github.ref == 'refs/heads/main'`: resta com'è.

- [ ] **Step 2: Validare la sintassi YAML**

```powershell
python -c "import yaml, sys; d = yaml.safe_load(open('.github/workflows/build-push.yaml', encoding='utf-8')); print(list(d['jobs']), d['jobs']['build-push']['needs'])"
```

Atteso: `['test', 'build-push', 'deploy'] test`. (Se `yaml` non è installato: `python -m pip install pyyaml` fuori dal repo.)

Limite dichiarato: la CI gira su Ubuntu (glibc), l'immagine su Alpine (musl). La prova su musl è il comando canonico locale (A6) e l'errore a import-time di `imaging.py` se manca l'encoder AVIF, che lo smoke test di `deploy.sh` intercetta prima dello switch.

- [ ] **Step 3: Commit**

```powershell
git branch --show-current
git add .github
git commit -m "Run the tests before building and deploying the worker"
```

### Task A5: calibrazione della qualità su foto vere

`IMAGE_QUALITY=65` è un valore di partenza, non una misura. Questo task lo sostituisce con un valore scelto guardando le foto vere del sito. **Richiede file dell'utente** (domanda aperta 3): il TIF da 120 MB del produttore, una foto di percorso da fotocamera, un HEIC da iPhone, un PNG con sfondo trasparente.

**Files:**
- Create: `scripts/calibrate.py`
- Modify (solo se la calibrazione lo giustifica): `imaging.py` (`AVIF_QUALITY`)

- [ ] **Step 1: Creare lo script**

```python
"""
Size and time of the AVIF master at several quality settings, for real photos.

    python scripts/calibrate.py OUT_DIR PHOTO [PHOTO ...]

Writes OUT_DIR/<name>.q<quality>.avif for every input and quality, and prints a
table. Look at the files, not only the numbers: the point is the lowest quality
at which nobody can tell the difference on the photos this site actually shows
(a bike on a transparent background, a trail at dusk, a phone HEIC), and only
the eye can say that. Not part of the deployed image.
"""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import imaging  # noqa: E402

QUALITIES = (45, 55, 65, 75, 85)


def main(out_dir: str, photos: list[str]) -> None:
    os.makedirs(out_dir, exist_ok=True)
    print(f"{'file':38} {'source MB':>9} {'q':>3} {'out KB':>8} {'seconds':>8}  size")
    for photo in photos:
        name = os.path.splitext(os.path.basename(photo))[0]
        source_mb = os.path.getsize(photo) / 1_048_576
        for quality in QUALITIES:
            imaging.AVIF_QUALITY = quality  # render_master reads the module value on every call
            dst = os.path.join(out_dir, f"{name}.q{quality}.avif")
            started = time.time()
            width, height = imaging.render_master(photo, dst)
            seconds = time.time() - started
            print(
                f"{name[:38]:38} {source_mb:9.1f} {quality:3d} "
                f"{os.path.getsize(dst) / 1024:8.0f} {seconds:8.1f}  {width}x{height}"
            )


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2:])
```

- [ ] **Step 2: Eseguirlo sulle foto vere, sulla stessa architettura della VM**

Mettere le foto in una cartella **fuori dal repo** (scratchpad di sessione o `temp/` del sito), una cartella vuota per l'output, e montarle. Cominciare da **una sola** foto per vedere che lo script giri (atteso: cinque righe, `q` 45…85, peso crescente con la qualità, lato lungo 2400 px o meno), poi passare tutte:

```powershell
docker run --rm --platform linux/arm64 -v "${PWD}:/app" -v "<cartella foto>:/photos" -v "<cartella output>:/out" -w /app python:3.12-alpine sh -c "pip install -q --no-cache-dir --root-user-action=ignore -r requirements.txt 2>&1 | grep -v notice; python scripts/calibrate.py /out /photos/*"
```

- [ ] **Step 3: Guardare i file** in `<cartella output>` (aprirli in un browser, a schermo intero e a 100%) e scegliere il `q` più basso in cui la differenza dall'originale non si vede sulle foto vere — con particolare attenzione al bordo della bici sullo sfondo trasparente e al cielo sfumato dei percorsi. Annotare la tabella (peso e secondi per `q`, anche del TIF da 120 MB) nella descrizione della PR.

- [ ] **Step 4: Aggiornare il default** solo se il valore scelto differisce da 65: in `imaging.py` cambiare `"65"` in `os.environ.get("IMAGE_QUALITY", "65")` con il valore scelto, e riportare nel commento sopra **la misura** ("scelto il 2026-09-24 guardando N foto, vedi PR #…") al posto di "Starting point".

- [ ] **Step 5: Commit**

```powershell
git branch --show-current
git add scripts imaging.py
git commit -m "Add a calibration script for the AVIF quality and settle the default"
```

### Task A6: verifica nell'immagine reale e PR del worker (senza merge)

**Files:** nessuno.

- [ ] **Step 1: Suite completa su amd64 e arm64**

Comando canonico due volte (la seconda con `--platform linux/arm64`). Atteso: tutto verde su entrambe (40 test con A3).

- [ ] **Step 2: Costruire l'immagine vera e provare lo smoke test di `deploy.sh`**

```powershell
docker build --platform linux/arm64 -t video-worker-local .
docker run --rm --platform linux/arm64 -e R2_ENDPOINT=https://example.invalid --entrypoint python3 video-worker-local -c "import heartbeat, main, config, status, storage, jobs; print('smoke test OK')"
```

Atteso: `smoke test OK`. Poi `docker rmi video-worker-local`.

- [ ] **Step 3: Aprire la PR — non mergiare**

```powershell
git branch --show-current
git push -u origin feat/image-processing
gh pr create --repo lelettricaleoni/videoStream-bucketWorker --base main --title "Process photos: any accepted upload in, one AVIF master out" --body "<cosa cambia; tabella di calibrazione di A5; l'ordine di merge (worker prima, sito dopo); che il merge fa deploy automatico sulla VM>"
```

Nel corpo della PR scrivere che **il merge sul `main` del worker distribuisce in produzione** e che si attende l'OK dell'utente. Poi **fermarsi**: nessun merge.

---

# Sezione B — Repo sito

Branch: `feat/photo-processing` da `origin/main` aggiornato. Prima di ogni commit `git branch --show-current` (il hook `.githooks/pre-commit` blocca `main`). Comandi: `npx vitest run` (unit), `npx tsc --noEmit`, `npx eslint <file>`, `npm run build` (webpack, dal CLAUDE.md).

### Task B1: helper puri in `lib/media-client.ts`

**Files:**
- Modify: `lib/media-client.ts`
- Create: `lib/media-client-photos.test.ts`

**Interfaces:**
- Consumes: `mediaPublicUrl(key: string): string` (esiste).
- Produces: `PHOTO_STAGING_PREFIXES`, `PHOTO_SOURCE_EXTENSIONS`, `isStagedPhotoKey(storageKey: string): boolean`, `photoPublicKey(storageKey: string): string`, `photoUrl(storageKey: string): string`, `photoSourceExtension(fileName: string): PhotoSourceExtension | null`, `photoContentType(ext): string`.

- [ ] **Step 1: Scrivere il test (fallirà)** — `lib/media-client-photos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isStagedPhotoKey, photoPublicKey, photoUrl, photoSourceExtension, photoContentType,
  PHOTO_SOURCE_EXTENSIONS,
} from './media-client'

// These pairs are the same ones tests/test_imaging.py pins in the worker
// repository. If one side changes and not the other, a photo is processed into a
// place the site never looks.
const PAIRS: [string, string][] = [
  ['private/route-photos/r1/u1.jpg', 'public/route-photos/r1/u1.avif'],
  ['private/route-photos/r1/u1.HEIC', 'public/route-photos/r1/u1.avif'],
  ['private/bike-model-photos/m1/u.2.tiff', 'public/bike-model-photos/m1/u.2.avif'],
]

describe('photoPublicKey', () => {
  it.each(PAIRS)('%s → %s', (staged, expected) => {
    expect(photoPublicKey(staged)).toBe(expected)
  })

  it('leaves a photo that predates the worker exactly where it is', () => {
    expect(photoPublicKey('route-photos/r1/u1.jpg')).toBe('route-photos/r1/u1.jpg')
    expect(photoPublicKey('bike-model-photos/m1/u1.png')).toBe('bike-model-photos/m1/u1.png')
  })

  it('does not treat a video source as a photo', () => {
    expect(photoPublicKey('private/route-videos/r1/u1.mp4')).toBe('private/route-videos/r1/u1.mp4')
  })
})

describe('isStagedPhotoKey', () => {
  it('is true only for the two staging prefixes', () => {
    expect(isStagedPhotoKey('private/route-photos/r1/u1.jpg')).toBe(true)
    expect(isStagedPhotoKey('private/bike-model-photos/m1/u1.jpg')).toBe(true)
    expect(isStagedPhotoKey('route-photos/r1/u1.jpg')).toBe(false)
    expect(isStagedPhotoKey('public/route-photos/r1/u1.avif')).toBe(false)
    expect(isStagedPhotoKey('private/route-videos/r1/u1.mp4')).toBe(false)
  })
})

describe('photoUrl', () => {
  it('points a staged photo at its master', () => {
    expect(photoUrl('private/route-photos/r1/u1.jpg').endsWith('/public/route-photos/r1/u1.avif')).toBe(true)
  })

  it('points a legacy photo at itself', () => {
    expect(photoUrl('route-photos/r1/u1.jpg').endsWith('/route-photos/r1/u1.jpg')).toBe(true)
  })
})

describe('photoSourceExtension', () => {
  it('accepts every format the worker decodes, in any case', () => {
    for (const ext of PHOTO_SOURCE_EXTENSIONS) {
      expect(photoSourceExtension(`IMG_0001.${ext.toUpperCase()}`)).toBe(ext)
    }
  })

  it('takes the last extension of a name with dots', () => {
    expect(photoSourceExtension('holiday.2026.08.heic')).toBe('heic')
  })

  it('rejects what the worker would leave in staging forever', () => {
    expect(photoSourceExtension('animation.gif')).toBeNull()
    expect(photoSourceExtension('vector.svg')).toBeNull()
    expect(photoSourceExtension('photo')).toBeNull()
    expect(photoSourceExtension('clip.mp4')).toBeNull()
  })
})

describe('photoContentType', () => {
  it('has a value for every accepted extension', () => {
    for (const ext of PHOTO_SOURCE_EXTENSIONS) {
      expect(photoContentType(ext)).toMatch(/^image\//)
    }
    expect(photoContentType('tif')).toBe('image/tiff')
    expect(photoContentType('heic')).toBe('image/heic')
  })
})
```

- [ ] **Step 2: Eseguire** `npx vitest run lib/media-client-photos.test.ts` — atteso FAIL (`isStagedPhotoKey is not a function`, export mancanti).

- [ ] **Step 3: Implementare** — in `lib/media-client.ts`, subito prima del commento `/** A media row with its HLS manifest already resolved on the server.`:

```ts
/**
 * Photos are uploaded to a staging prefix and the worker
 * (lelettricaleoni/videoStream-bucketWorker, imaging.py) turns each one into an
 * AVIF master under the matching `public/` key. **The key mapping and the
 * extension list below are a contract with that file**: change one side and you
 * must change the other; both test suites pin the same pairs.
 *
 * A photo uploaded before the worker handled photos sits directly at its public
 * key. It is recognised by *not* being staged, and served exactly as before —
 * no data migration, and nothing to backfill.
 */
export const PHOTO_STAGING_PREFIXES = ['private/route-photos/', 'private/bike-model-photos/'] as const

/** Formats the worker can decode; anything else would sit in staging forever. */
export const PHOTO_SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif'] as const

const PHOTO_CONTENT_TYPES: Record<(typeof PHOTO_SOURCE_EXTENSIONS)[number], string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
}

export function isStagedPhotoKey(storageKey: string): boolean {
  return PHOTO_STAGING_PREFIXES.some((prefix) => storageKey.startsWith(prefix))
}

/** private/route-photos/{owner}/{uuid}.jpg → public/route-photos/{owner}/{uuid}.avif; any other key is already public. */
export function photoPublicKey(storageKey: string): string {
  if (!isStagedPhotoKey(storageKey)) return storageKey
  const dot = storageKey.lastIndexOf('.')
  const stem = dot > storageKey.lastIndexOf('/') ? storageKey.slice(0, dot) : storageKey
  return 'public/' + stem.slice('private/'.length) + '.avif'
}

/** Public URL of a photo as it will be served once ready. Says nothing about whether it is ready. */
export function photoUrl(storageKey: string): string {
  return mediaPublicUrl(photoPublicKey(storageKey))
}

/** Lower-cased extension of an uploaded file if the worker can decode it, otherwise null. */
export function photoSourceExtension(fileName: string): (typeof PHOTO_SOURCE_EXTENSIONS)[number] | null {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return null
  const ext = fileName.slice(dot + 1).toLowerCase()
  return (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as (typeof PHOTO_SOURCE_EXTENSIONS)[number])
    : null
}

/**
 * Derived from the extension, not the browser's `file.type`: Chrome on Windows
 * reports an empty type for a HEIC file, and the type is signed into the upload
 * URL, so both sides have to agree on exactly one value.
 */
export function photoContentType(ext: (typeof PHOTO_SOURCE_EXTENSIONS)[number]): string {
  return PHOTO_CONTENT_TYPES[ext]
}

```

- [ ] **Step 4: Eseguire** `npx vitest run lib/media-client-photos.test.ts lib/media-client.test.ts` — atteso PASS (19 test).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/media-client.ts lib/media-client-photos.test.ts
git commit -m "Add the key mapping for staged photos to media-client"
```

### Task B2: `lib/media.ts` — risoluzione, cancellazione, presign delle foto

**Files:**
- Modify: `lib/media.ts`
- Create: `lib/media.test.ts`

**Interfaces:**
- Consumes (da B1): `isStagedPhotoKey`, `photoPublicKey`, `photoUrl`, `MediaWithHls`. Esistenti: `readThrough`, `getStore`, `CacheStore` (`lib/cache.ts`), `r2ObjectExists`, `deleteR2Prefix`, `resolveHlsUrl`, `deleteR2Object` (`lib/r2.ts`).
- Produces: `getPhotoPresignedUploadUrl(key: string, contentType: string): Promise<string>`; `resolvePhotoUrl(storageKey: string, exists?: (key: string) => Promise<boolean>, store?: CacheStore | null): Promise<string | null>`; `resolveReadyMedia(items: Media[], resolvers?): Promise<MediaWithHls[]>`; `deleteMediaFiles(m: Pick<Media, 'storageKey' | 'mediaType'>): Promise<void>`.

- [ ] **Step 1: Scrivere il test (fallirà)** — `lib/media.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/r2 builds an S3 client from environment variables at import time. The
// tests never talk to storage: they hand the functions their own `exists`.
const deleteR2Object = vi.fn(async (_key: string) => {})
const send = vi.fn(async (_command: unknown) => ({ Contents: [], NextContinuationToken: undefined }))
vi.mock('./r2', () => ({
  s3: { send: (command: unknown) => send(command) },
  R2_BUCKET: 'test-bucket',
  deleteR2Object: (key: string) => deleteR2Object(key),
  r2PublicUrl: (key: string) => `https://cdn.test/${key}`,
}))

import { resolvePhotoUrl, resolveReadyMedia, deleteMediaFiles } from './media'
import type { CacheStore } from './cache'
import type { Media } from './db'

function fakeStore() {
  const data = new Map<string, unknown>()
  const writes: string[] = []
  const store: CacheStore = {
    async get<T>(key: string) {
      return (data.has(key) ? (data.get(key) as T) : null)
    },
    async set(key, value) {
      writes.push(key)
      data.set(key, value)
      return 'OK'
    },
  }
  return { store, writes }
}

function row(over: Partial<Media>): Media {
  return {
    id: 'id', routeId: 'r', bikeModelId: null, storageKey: 'k', mediaType: 'photo',
    displayOrder: 0, altText: null, sha256: null, createdAt: new Date(0), ...over,
  }
}

beforeEach(() => {
  deleteR2Object.mockClear()
  send.mockClear()
})

describe('resolvePhotoUrl', () => {
  it('answers a photo that predates the worker without looking anything up', async () => {
    const exists = vi.fn(async () => false)
    const url = await resolvePhotoUrl('route-photos/r1/u1.jpg', exists, null)
    expect(url?.endsWith('/route-photos/r1/u1.jpg')).toBe(true)
    expect(exists).not.toHaveBeenCalled()
  })

  it('hides a staged photo whose master does not exist yet', async () => {
    const exists = vi.fn(async () => false)
    expect(await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, null)).toBeNull()
    expect(exists).toHaveBeenCalledWith('public/route-photos/r1/u1.avif')
  })

  it('shows a staged photo once its master exists', async () => {
    const url = await resolvePhotoUrl('private/route-photos/r1/u1.jpg', async () => true, null)
    expect(url?.endsWith('/public/route-photos/r1/u1.avif')).toBe(true)
  })

  it('remembers that a master exists, so the next visitor costs no storage call', async () => {
    const { store, writes } = fakeStore()
    const exists = vi.fn(async () => true)
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, store)
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, store)
    expect(exists).toHaveBeenCalledTimes(1)
    expect(writes).toEqual(['img:v1:private/route-photos/r1/u1.jpg'])
  })

  it('never remembers "not yet": a photo still in the worker must appear when it is done', async () => {
    const { store, writes } = fakeStore()
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', async () => false, store)
    expect(writes).toEqual([])
  })
})

describe('resolveReadyMedia', () => {
  const resolvers = {
    hls: async (key: string) => (key.includes('ready') ? `https://cdn.test/${key}/master.m3u8` : null),
    photo: async (key: string) => (key.includes('ready') ? `https://cdn.test/${key}` : null),
  }

  it('keeps what is ready, drops what is not, and keeps the order', async () => {
    const result = await resolveReadyMedia([
      row({ id: 'a', storageKey: 'photo-ready-1' }),
      row({ id: 'b', storageKey: 'photo-pending' }),
      row({ id: 'c', storageKey: 'video-ready', mediaType: 'video' }),
      row({ id: 'd', storageKey: 'video-pending', mediaType: 'video' }),
      row({ id: 'e', storageKey: 'photo-ready-2' }),
    ], resolvers)
    expect(result.map((m) => m.id)).toEqual(['a', 'c', 'e'])
  })

  it('carries the resolved manifest on a ready video', async () => {
    const [video] = await resolveReadyMedia([row({ storageKey: 'video-ready', mediaType: 'video' })], resolvers)
    expect(video.hlsUrl).toBe('https://cdn.test/video-ready/master.m3u8')
  })

  it('returns nothing for a gallery of things still processing', async () => {
    expect(await resolveReadyMedia([row({ storageKey: 'photo-pending' })], resolvers)).toEqual([])
  })
})

describe('deleteMediaFiles', () => {
  it('removes a staged photo\'s master along with its source', async () => {
    await deleteMediaFiles({ storageKey: 'private/route-photos/r1/u1.jpg', mediaType: 'photo' })
    expect(deleteR2Object.mock.calls.map((c) => c[0]).sort()).toEqual([
      'private/route-photos/r1/u1.jpg',
      'public/route-photos/r1/u1.avif',
    ])
  })

  it('removes only the file of a photo that predates the worker', async () => {
    await deleteMediaFiles({ storageKey: 'route-photos/r1/u1.jpg', mediaType: 'photo' })
    expect(deleteR2Object.mock.calls.map((c) => c[0])).toEqual(['route-photos/r1/u1.jpg'])
  })

  it('removes a video\'s source and its whole ladder', async () => {
    await deleteMediaFiles({ storageKey: 'private/route-videos/r1/u1.mp4', mediaType: 'video' })
    expect(deleteR2Object).toHaveBeenCalledWith('private/route-videos/r1/u1.mp4')
    expect(send).toHaveBeenCalled() // the ladder is listed, then deleted, by prefix
  })
})
```

- [ ] **Step 2: Eseguire** `npx vitest run lib/media.test.ts` — atteso FAIL (`resolvePhotoUrl is not a function`).

- [ ] **Step 3: Implementare** — in `lib/media.ts`:

Sostituire le prime tre righe di import:

```ts
import { s3, R2_BUCKET } from './r2'
import { deriveHlsPrefix, hlsUrl, HLS_MANIFESTS } from './media-client'
import { readThrough } from './cache'
```

con:

```ts
import { s3, R2_BUCKET, deleteR2Object } from './r2'
import {
  deriveHlsPrefix, hlsUrl, HLS_MANIFESTS,
  isStagedPhotoKey, photoPublicKey, photoUrl,
  type MediaWithHls,
} from './media-client'
import { readThrough, type CacheStore, getStore } from './cache'
import type { Media } from './db'
```

Dopo `const VIDEO_UPLOAD_TTL_S = 3600` aggiungere:

```ts

/** A ready photo's master never moves either, so its existence can be kept as long as a manifest's. */
const PHOTO_READY_TTL_S = 7 * 24 * 60 * 60

/**
 * Photos share the video window on purpose: the manufacturer TIFF that started
 * the image pipeline weighs 120 MB, which the five minutes a photo used to get
 * would not cover on a slow line.
 */
const PHOTO_UPLOAD_TTL_S = 3600
```

Dopo `getVideoPresignedUploadUrl` aggiungere:

```ts

export async function getPhotoPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: PHOTO_UPLOAD_TTL_S })
}
```

Prima delle righe `export { deriveHlsPrefix, … }` in fondo, aggiungere:

```ts
/**
 * Public URL of a photo, or null while the worker has not finished it.
 *
 * A photo uploaded before the worker handled photos is already public, so it
 * answers at once with no lookup at all. A staged one is ready when its master
 * exists; only that fact is cached (never the URL, whose host differs per
 * environment) and, like a video's manifest, a "not yet" is never cached.
 */
export async function resolvePhotoUrl(
  storageKey: string,
  exists: (key: string) => Promise<boolean> = r2ObjectExists,
  store: CacheStore | null = getStore()
): Promise<string | null> {
  if (!isStagedPhotoKey(storageKey)) return photoUrl(storageKey)
  const ready = await readThrough<true | null>(
    `img:v1:${storageKey}`,
    async () => ((await exists(photoPublicKey(storageKey))) ? true : null),
    PHOTO_READY_TTL_S,
    store
  )
  return ready ? photoUrl(storageKey) : null
}

/**
 * The media a visitor can see: every photo and video whose file is actually
 * there, in order, with each video's manifest resolved. What is still being
 * processed is left out silently, never shown as broken.
 */
export async function resolveReadyMedia(
  items: Media[],
  resolvers: {
    hls: (key: string) => Promise<string | null>
    photo: (key: string) => Promise<string | null>
  } = { hls: resolveHlsUrl, photo: resolvePhotoUrl }
): Promise<MediaWithHls[]> {
  const resolved = await Promise.all(
    items.map(async (m): Promise<MediaWithHls | null> => {
      if (m.mediaType === 'video') {
        const hls = await resolvers.hls(m.storageKey)
        return hls ? { ...m, hlsUrl: hls } : null
      }
      return (await resolvers.photo(m.storageKey)) ? m : null
    })
  )
  return resolved.filter((m): m is MediaWithHls => m !== null)
}

/**
 * Everything a media row left on R2. A video leaves its source and its HLS
 * ladder; a staged photo leaves its source (if the worker never got to it) and
 * its master. Deleting only `storageKey` used to be enough, and would now strand
 * every processed photo's AVIF forever.
 */
export async function deleteMediaFiles(m: Pick<Media, 'storageKey' | 'mediaType'>): Promise<void> {
  if (m.mediaType === 'video') {
    await Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
    return
  }
  await Promise.all([
    deleteR2Object(m.storageKey),
    ...(isStagedPhotoKey(m.storageKey) ? [deleteR2Object(photoPublicKey(m.storageKey))] : []),
  ])
}

```

- [ ] **Step 4: Eseguire** `npx vitest run lib/media.test.ts` — atteso PASS (11 test). Poi `npx tsc --noEmit` (deve restare pulito).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/media.ts lib/media.test.ts
git commit -m "Resolve photo URLs like HLS manifests, and delete a photo's master with its source"
```

### Task B3: progresso, chiavi dei job, hash nel browser

**Files:**
- Modify: `lib/media-progress.ts`, `lib/media-progress.test.ts`, `lib/video-jobs.ts`, `lib/video-jobs.test.ts`
- Create: `lib/hash-client.ts`, `lib/hash-client.test.ts`

**Interfaces:**
- Consumes: `VideoJobStatus` (esiste).
- Produces: `mediaProgress(mediaType, upload?, job?, options?: { awaiting?: boolean }): MediaProgress | null`; `TRACKED_JOB_PREFIXES`, `isTrackedJobKey(key: unknown): key is string`; `BROWSER_HASH_MAX_BYTES`, `sha256HexOfFile(file: Blob): Promise<string>`.

- [ ] **Step 1: Scrivere i test (falliranno)**

In `lib/media-progress.test.ts` sostituire il blocco `describe('mediaProgress — photo', …)` con:

```ts
describe('mediaProgress — photo', () => {
  it('the upload fills the first half, like a video: the worker still has to process it', () => {
    expect(mediaProgress('photo', { progress: 40 })?.percent).toBe(20)
    expect(mediaProgress('photo', { progress: 100 })?.percent).toBe(50)
  })

  it('says nothing about a photo the panel merely loaded', () => {
    // Either it predates the worker or it was finished long ago (a finished
    // job's status only lives a few minutes): nothing left to wait for.
    expect(mediaProgress('photo', undefined)).toBeNull()
  })

  it('covers the gap between upload and worker for a photo uploaded just now', () => {
    const p = mediaProgress('photo', undefined, undefined, { awaiting: true })
    expect(p).toMatchObject({ percent: 50, tone: 'working', active: true })
    expect(p!.label).toContain('Waiting')
  })

  it('follows the worker like a video does, and ends ready', () => {
    expect(mediaProgress('photo', undefined, job('downloading'))?.label).toBe('Downloading')
    expect(mediaProgress('photo', undefined, job('uploading'))?.label).toBe('Saving')
    expect(mediaProgress('photo', undefined, job('done'))).toMatchObject({
      percent: 100, tone: 'ready', active: false,
    })
  })

  it('does not claim 0% for a step that reports no percentage', () => {
    // The worker's photo step is a single encode: it publishes the phase and no number.
    expect(mediaProgress('photo', undefined, job('transcoding'))?.label).toBe('Processing')
    expect(mediaProgress('photo', undefined, job('transcoding', { progress: 0 }))?.label).toBe('Processing 0%')
  })

  it('shows a failure with its reason', () => {
    expect(mediaProgress('photo', undefined, job('failed', { error: 'cannot identify image file' }))).toMatchObject({
      tone: 'error', active: false, detail: 'cannot identify image file',
    })
  })
})
```

In `lib/video-jobs.test.ts`: nell'import aggiungere `isTrackedJobKey`, e prima di `describe('readJobStatus', …)` inserire:

```ts
describe('isTrackedJobKey', () => {
  it('accepts the keys the worker takes from staging: videos and photos', () => {
    expect(isTrackedJobKey('private/route-videos/r/u.mp4')).toBe(true)
    expect(isTrackedJobKey('private/route-photos/r/u.heic')).toBe(true)
    expect(isTrackedJobKey('private/bike-model-photos/m/u.tif')).toBe(true)
  })

  it('refuses anything else, so the panel cannot be made to read arbitrary cache keys', () => {
    expect(isTrackedJobKey('route-photos/r/u.jpg')).toBe(false)
    expect(isTrackedJobKey('__worker__')).toBe(false)
    expect(isTrackedJobKey('hls:v2:private/route-videos/r/u.mp4')).toBe(false)
    expect(isTrackedJobKey(42)).toBe(false)
    expect(isTrackedJobKey(undefined)).toBe(false)
  })
})

```

`lib/hash-client.test.ts` (nuovo):

```ts
import { describe, it, expect } from 'vitest'
import { sha256HexOfFile } from './hash-client'
import { sha256Hex } from './hash'

describe('sha256HexOfFile', () => {
  it('matches the well-known digest of "abc"', async () => {
    expect(await sha256HexOfFile(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('agrees with the server-side hash, so a duplicate is a duplicate on both sides', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(await sha256HexOfFile(new Blob([bytes]))).toBe(sha256Hex(Buffer.from(bytes)))
  })

  it('hashes an empty file', async () => {
    expect(await sha256HexOfFile(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})
```

- [ ] **Step 2: Eseguire** `npx vitest run lib/media-progress.test.ts lib/video-jobs.test.ts lib/hash-client.test.ts` — atteso FAIL (foto al 40% invece di 20%; `isTrackedJobKey`/`hash-client` mancanti).

- [ ] **Step 3: Implementare**

`lib/media-progress.ts` — sostituire il blocco da `/** A photo is done when it has been uploaded; a video has only got halfway. */` fino al primo `if (!job) { … }` compreso con:

```ts
/** Every upload only gets halfway: the worker still has to process it. */
const UPLOAD_SHARE = 50

export interface MediaProgressOptions {
  /**
   * Whether a missing job status means "the worker has not got to it yet".
   * True for a video (every one goes through the worker) and for a photo
   * uploaded in this session. False for a photo the panel merely loaded: it
   * either predates the worker or was finished long ago — the status outlives
   * a finished job by minutes — and either way there is nothing to wait for.
   */
  awaiting?: boolean
}

export function mediaProgress(
  mediaType: 'photo' | 'video',
  upload?: UploadState,
  job?: VideoJobStatus,
  options: MediaProgressOptions = {}
): MediaProgress | null {
  if (upload?.failed) {
    return { percent: 100, label: 'Upload failed', tone: 'error', active: false }
  }

  if (upload) {
    return {
      percent: Math.round((upload.progress * UPLOAD_SHARE) / 100),
      label: `Uploading ${upload.progress}%`,
      tone: 'working',
      active: true,
    }
  }

  if (!job) {
    if (!(options.awaiting ?? mediaType === 'video')) return null
    // The file is on R2 and the worker finds it by listing the bucket, so this
    // wait is expected and finite. Saying nothing here is what made the work
    // look stalled.
    return {
      percent: UPLOAD_SHARE,
      label: 'Waiting to be processed',
      tone: 'working',
      active: true,
    }
  }
```

e sostituire il calcolo di `label` con:

```ts
  // A photo is one call to the encoder and reports no percentage: saying "0%"
  // for the whole minute it takes would look like a job that never started.
  const label =
    job.phase === 'transcoding' && job.progress !== undefined
      ? `${PHASE_LABELS.transcoding} ${job.progress}%`
      : PHASE_LABELS[job.phase]
```

`lib/video-jobs.ts` — prima di `export const VIDEO_JOB_PHASES` aggiungere il commento:

```ts
/**
 * Photos are reported through here too, under the same `videojob:v1:` keys and
 * with the same phases — `transcoding` included, for a photo that is being
 * encoded. Not a naming oversight: the worker's Upstash token can only SET keys
 * starting `videojob:`, the storage key already says what kind of thing a job is
 * about, and a phase this parser does not know is rejected, which reads as "the
 * worker never touched it". Renaming the file would touch the worker's contract
 * for no behaviour.
 */
```

e dopo `jobKey` aggiungere:

```ts

/** Storage keys the worker reports on: what it takes from staging and turns into something playable or viewable. */
export const TRACKED_JOB_PREFIXES = [
  'private/route-videos/',
  'private/route-photos/',
  'private/bike-model-photos/',
] as const

export function isTrackedJobKey(key: unknown): key is string {
  return typeof key === 'string' && TRACKED_JOB_PREFIXES.some((prefix) => key.startsWith(prefix))
}
```

`lib/hash-client.ts` (nuovo):

```ts
/**
 * SHA-256 of a file, computed in the browser.
 *
 * Photos used to pass through the server on their way to R2, which hashed them
 * and could refuse a duplicate before storing anything. They now go straight to
 * storage (a 120 MB TIFF does not fit through a serverless function's request
 * body), so the browser has to do the hashing to keep that warning. Same digest
 * as lib/hash.ts — and as the worker's, which hashes the very same bytes.
 */

/**
 * Above this the file is not hashed here: `subtle.digest` needs the whole file
 * in memory at once. The worker reports the hash after processing anyway (see
 * lib/actions/media-hash.ts), so a huge file loses only the early warning.
 */
export const BROWSER_HASH_MAX_BYTES = 300 * 1024 * 1024

export async function sha256HexOfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Eseguire** `npx vitest run` — atteso PASS su tutta la suite (160 test a questo punto).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/media-progress.ts lib/media-progress.test.ts lib/video-jobs.ts lib/video-jobs.test.ts lib/hash-client.ts lib/hash-client.test.ts
git commit -m "Give photos the two-halved progress bar, tracked job keys and a browser-side hash"
```

### Task B4: Server Action — presign in staging, duplicati, stato

**Files:**
- Modify: `lib/actions/routes.ts`, `lib/actions/bike-models.ts`, `lib/actions/media-hash.ts`
- Create: `lib/actions/media-jobs.ts`
- Delete: `lib/actions/video-jobs.ts`

**Interfaces:**
- Consumes (da B1/B2/B3): `photoSourceExtension`, `photoContentType`, `getPhotoPresignedUploadUrl`, `deleteMediaFiles`, `isTrackedJobKey`, `readJobStatus`.
- Produces: `getPresignedUploadUrlAction(routeId, fileName, contentType, type: 'photo' | 'gpx'): Promise<{ url: string; key: string; contentType: string }>` (per `photo` la chiave è `private/route-photos/{routeId}/{uuid}.{ext}`); `getBikeModelPresignedUploadUrlAction(bikeModelId, fileName, _contentType, _type): Promise<{ url; key; contentType }>` (`private/bike-model-photos/…`); `findDuplicateMediaAction(sha256: string): Promise<{ duplicate: boolean }>`; `recordMediaHashAction(storageKey, sha256): Promise<{ duplicate: boolean }>`; `getMediaJobStatuses(storageKeys: string[]): Promise<Record<string, VideoJobStatus>>`. `contentType` restituito è quello **firmato**: il client deve mandare esattamente quello.

- [ ] **Step 1: `lib/actions/routes.ts`**

Sostituire l'import `import { getVideoPresignedUploadUrl, deleteR2Prefix, deriveHlsPrefix } from '@/lib/media'` con:

```ts
import { getVideoPresignedUploadUrl, getPhotoPresignedUploadUrl, deleteMediaFiles } from '@/lib/media'
import { photoSourceExtension, photoContentType } from '@/lib/media-client'
```

(`deleteR2Object` resta importato da `@/lib/r2`: serve ancora per il GPX in `deleteRouteAction`.)

In `updateRouteAction`, sostituire

```ts
  await Promise.all(removed.map((m) =>
    m.mediaType === 'video'
      ? Promise.all([deleteR2Object(m.storageKey), deleteR2Prefix(deriveHlsPrefix(m.storageKey))])
      : deleteR2Object(m.storageKey)
  ))
```

con `  await Promise.all(removed.map(deleteMediaFiles))`; in `deleteRouteAction` sostituire il blocco analogo su `existingMedia` con `  await Promise.all(existingMedia.map(deleteMediaFiles))`.

Sostituire `getPresignedUploadUrlAction` con:

```ts
/**
 * A photo goes to the staging prefix, where the worker turns it into an AVIF
 * master (see lib/media-client.ts). The content type is derived from the
 * extension and returned: it is signed into the URL, so the browser has to send
 * exactly this value and not whatever `file.type` says (empty, for a HEIC file
 * on Chrome for Windows).
 */
export async function getPresignedUploadUrlAction(
  routeId: string,
  fileName: string,
  contentType: string,
  type: 'photo' | 'gpx'
) {
  await requireAdmin()
  if (type === 'photo') {
    const ext = photoSourceExtension(fileName)
    if (!ext) throw new Error(`Unsupported photo format: ${fileName}`)
    const key = `private/route-photos/${routeId}/${crypto.randomUUID()}.${ext}`
    const photoType = photoContentType(ext)
    const url = await getPhotoPresignedUploadUrl(key, photoType)
    return { url, key, contentType: photoType }
  }
  const key = `route-gpx/${routeId}/track.gpx`
  const url = await getPresignedUploadUrl(key, contentType)
  return { url, key, contentType }
}
```

- [ ] **Step 2: `lib/actions/bike-models.ts`**

Sostituire le due righe di import (`deleteR2Object, getPresignedUploadUrl` da `@/lib/r2` e `getVideoPresignedUploadUrl, deleteR2Prefix, deriveHlsPrefix` da `@/lib/media`) con:

```ts
import { getVideoPresignedUploadUrl, getPhotoPresignedUploadUrl, deleteMediaFiles } from '@/lib/media'
import { photoSourceExtension, photoContentType } from '@/lib/media-client'
```

In `syncMediaItems` sostituire il blocco `await Promise.all(removed.map((m) => …))` con `  await Promise.all(removed.map(deleteMediaFiles))`; in `deleteBikeModelAction` sostituire il blocco su `items` con `  await Promise.all(items.map(deleteMediaFiles))`. Sostituire `getBikeModelPresignedUploadUrlAction` con:

```ts
/** Staged for the worker, like a route photo: see getPresignedUploadUrlAction in routes.ts. */
export async function getBikeModelPresignedUploadUrlAction(
  bikeModelId: string,
  fileName: string,
  _contentType: string,
  _type: 'photo'
) {
  await requireAdmin()
  const ext = photoSourceExtension(fileName)
  if (!ext) throw new Error(`Unsupported photo format: ${fileName}`)
  const key = `private/bike-model-photos/${bikeModelId}/${crypto.randomUUID()}.${ext}`
  const contentType = photoContentType(ext)
  const url = await getPhotoPresignedUploadUrl(key, contentType)
  return { url, key, contentType }
}
```

- [ ] **Step 3: `lib/actions/media-hash.ts`** — sostituire l'intero file con:

```ts
'use server'
import { eq, ne, and } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'

/**
 * Before a photo is uploaded: does an identical one already exist anywhere on
 * the site? The browser hashes the file and asks here, so the admin can be
 * warned before any bytes move (see lib/hash-client.ts for why the browser and
 * not the server hashes it).
 */
export async function findDuplicateMediaAction(sha256: string): Promise<{ duplicate: boolean }> {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')

  const [match] = await db.select({ id: media.id }).from(media).where(eq(media.sha256, sha256)).limit(1)
  return { duplicate: Boolean(match) }
}

/**
 * Called once a job reports `done` with a sha256 — the only moment the worker
 * knows it, since the source file is gone right after. Covers videos, and any
 * photo the browser could not hash itself (a file too large to hold in memory);
 * for a hashed photo it just re-writes the value it already has. Safe to call
 * before the media row exists yet (a brand-new upload not saved with the form):
 * the UPDATE simply matches zero rows, and the hash reaches the database anyway
 * once the form is saved, carried through mediaItems (see MediaUpload).
 */
export async function recordMediaHashAction(storageKey: string, sha256: string): Promise<{ duplicate: boolean }> {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')

  const [existingMatch] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.sha256, sha256), ne(media.storageKey, storageKey)))
    .limit(1)

  await db.update(media).set({ sha256 }).where(eq(media.storageKey, storageKey))

  return { duplicate: Boolean(existingMatch) }
}
```

- [ ] **Step 4: `lib/actions/media-jobs.ts`** (nuovo) ed eliminare `lib/actions/video-jobs.ts`:

```ts
'use server'
import { getAdminUser } from '@/lib/supabase/server'
import { isTrackedJobKey, readJobStatus, type VideoJobStatus } from '@/lib/video-jobs'

/**
 * Worker status for the videos and photos shown in the admin panel.
 *
 * A Server Action rather than a route handler: the caller is our own client.
 * Only the worker gets an endpoint, because it cannot address one of these.
 */
export async function getMediaJobStatuses(
  storageKeys: string[]
): Promise<Record<string, VideoJobStatus>> {
  if (!(await getAdminUser())) return {}

  // Bounded: a panel with many items must not turn into an unbounded fan-out
  // against the cache on every poll.
  const keys = storageKeys.filter(isTrackedJobKey).slice(0, 50)

  const entries = await Promise.all(
    keys.map(async (key) => [key, await readJobStatus(key)] as const)
  )

  return Object.fromEntries(
    entries.filter((e): e is readonly [string, VideoJobStatus] => e[1] !== null)
  )
}
```

```bash
git rm lib/actions/video-jobs.ts
```

- [ ] **Step 5: Verificare** — `npx tsc --noEmit` **fallirà** solo per `components/admin/media-upload.tsx` (importa ancora i nomi vecchi e la firma vecchia): è atteso, lo risolve B5. Nessun altro errore ammesso. Non committare ancora se il branch deve restare compilabile: **committare insieme a B5** (`git add` ora, commit al Step finale di B5).

### Task B5: `MediaUpload` — PUT presigned per tutti, hash prima, polling anche per le foto

**Files:**
- Modify: `components/admin/media-upload.tsx`

**Interfaces:**
- Consumes: da B1 `photoUrl`, `isStagedPhotoKey`; da B3 `mediaProgress(…, { awaiting })`, `sha256HexOfFile`, `BROWSER_HASH_MAX_BYTES`; da B4 `getMediaJobStatuses`, `recordMediaHashAction`, `findDuplicateMediaAction`, e la nuova firma `getPresignedUploadUrl(...) => Promise<{ url; key; contentType }>`.
- Produces: stesso export `MediaUpload` e `MediaItem`; nessun cambiamento per `route-form.tsx` / `bike-model-form.tsx` (passano le stesse funzioni).

- [ ] **Step 1: Sostituire l'intero contenuto di `components/admin/media-upload.tsx`** con il file che segue (differenze rispetto a oggi: import; niente `DuplicateUploadError`/`forceKey`/`FormData`/`/api/upload`; `PhotoThumb`; polling e registrazione hash per ogni elemento tracciato; `uploadFile` con hash + PUT per tutti; dropzone esatto; testi):

```tsx
'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Upload, Video, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { photoUrl, isStagedPhotoKey } from '@/lib/media-client'
import { getMediaJobStatuses } from '@/lib/actions/media-jobs'
import { recordMediaHashAction, findDuplicateMediaAction } from '@/lib/actions/media-hash'
import { sha256HexOfFile, BROWSER_HASH_MAX_BYTES } from '@/lib/hash-client'
import type { VideoJobStatus } from '@/lib/video-jobs'
import { mediaProgress, type UploadState } from '@/lib/media-progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const VIDEO_EXTENSION = /\.(mp4|mov|avi|mkv|webm)$/i

export interface MediaItem {
  id: string
  storageKey: string
  mediaType: 'photo' | 'video'
  preview: string
  /** Shown while uploading, when the storage key means nothing to a human. */
  fileName?: string
  /** Present only until the file has finished leaving the browser. */
  upload?: UploadState
  /** Known before upload for a photo the browser could hash; otherwise arrives later, from the worker. */
  sha256?: string
}

function ProgressBar({
  item,
  job,
}: {
  item: MediaItem
  job?: VideoJobStatus
}) {
  // Something the panel merely loaded has no status once the worker's has
  // expired; only what was uploaded in this session is worth waiting on.
  const progress = mediaProgress(item.mediaType, item.upload, job, {
    awaiting: item.mediaType === 'video' || Boolean(item.fileName),
  })
  if (!progress) return null

  const barColour =
    progress.tone === 'error' ? 'bg-destructive'
    : progress.tone === 'ready' ? 'bg-green-600'
    : 'bg-[#366DA1]'
  const textColour =
    progress.tone === 'error' ? 'text-destructive'
    : progress.tone === 'ready' ? 'text-green-700'
    : 'text-muted-foreground'

  return (
    <div className="mt-1 flex items-center gap-2" title={progress.detail}>
      <div className="flex-1 bg-muted rounded-full h-1">
        <div
          className={`${barColour} h-1 rounded-full transition-all duration-500`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className={`text-[10px] whitespace-nowrap ${textColour}`}>{progress.label}</span>
    </div>
  )
}

/**
 * A browser cannot draw a TIFF, and most cannot draw a HEIC; a processed photo's
 * master does not exist until the worker is done. Either way the <img> fails, and
 * an icon is a more honest thumbnail than a broken-image glyph. Keyed by `src` at
 * the call site, so a new source gets a fresh chance.
 */
function PhotoThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
        <ImageIcon size={20} className="text-muted-foreground" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFailed(true)} className="w-16 h-12 object-cover rounded shrink-0" />
  )
}

function SortableItem({
  item,
  job,
  onRemove,
}: {
  item: MediaItem
  job?: VideoJobStatus
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    // Reordering something that is still arriving would fight the upload.
    disabled: Boolean(item.upload),
  })
  const uploading = Boolean(item.upload)
  // The thumbnail of a photo just uploaded is the file itself, held in the
  // browser. Once the worker is done the real thing exists, and that is what the
  // page will show — so the panel switches to it and the admin sees the result.
  const thumbSrc =
    item.mediaType === 'photo' && item.preview.startsWith('blob:') && job?.phase === 'done'
      ? photoUrl(item.storageKey)
      : item.preview

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 bg-card border rounded-lg p-2 ${uploading ? 'opacity-70' : ''}`}
    >
      {uploading ? (
        <div className="w-4 shrink-0" />
      ) : (
        <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab shrink-0">
          <GripVertical size={16} />
        </button>
      )}

      {item.mediaType === 'photo' ? (
        <PhotoThumb key={thumbSrc} src={thumbSrc} />
      ) : (
        <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <Video size={20} className="text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate block">
          {item.fileName ?? item.storageKey.split('/').pop()}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.mediaType === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {item.mediaType === 'video' ? 'Video' : 'Photo'}
          </span>
        </div>
        <ProgressBar item={item} job={job} />
      </div>

      {!uploading && (
        <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 cursor-pointer shrink-0">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function MediaUpload({
  ownerId,
  defaultItems = [],
  getPresignedUploadUrl,
  getVideoPresignedUploadUrl,
}: {
  ownerId: string
  defaultItems?: { storageKey: string; mediaType: 'photo' | 'video' }[]
  getPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string, type: 'photo') => Promise<{ url: string; key: string; contentType: string }>
  getVideoPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string) => Promise<{ url: string; key: string }>
}) {
  const [items, setItems] = useState<MediaItem[]>(
    defaultItems.map((m) => ({
      id: m.storageKey,
      storageKey: m.storageKey,
      mediaType: m.mediaType,
      preview: m.mediaType === 'photo' ? photoUrl(m.storageKey) : '',
    }))
  )
  const [jobs, setJobs] = useState<Record<string, VideoJobStatus>>({})

  // What the worker processes: every video, and every photo uploaded through
  // the staging prefix. A photo that predates the worker has no status at all.
  // Strings, not arrays: an array literal would be a new object on every render
  // and restart the poll each time.
  const jobKeys = items
    .filter((i) => !i.upload && (i.mediaType === 'video' || isStagedPhotoKey(i.storageKey)))
    .map((i) => i.storageKey)
    .join('|')
  // Items that arrived in this session are worth waiting on even before the
  // worker has said anything; older ones simply never had a status.
  const freshKeys = items
    .filter((i) => !i.upload && i.fileName && (i.mediaType === 'video' || isStagedPhotoKey(i.storageKey)))
    .map((i) => i.storageKey)
    .join('|')

  useEffect(() => {
    const all = jobKeys ? jobKeys.split('|') : []
    if (all.length === 0) return
    const fresh = new Set(freshKeys ? freshKeys.split('|') : [])

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // A worker that never picks the job up must not leave the panel polling
    // forever: after this many rounds the bar simply stops moving.
    let rounds = 100

    async function tick(keys: string[]) {
      let statuses: Record<string, VideoJobStatus> = {}
      try {
        statuses = await getMediaJobStatuses(keys)
      } catch {
        // A stale bar beats an error message in the panel.
        return
      }
      if (cancelled) return
      setJobs((prev) => ({ ...prev, ...statuses }))

      const active = keys.filter((key) => {
        const phase = statuses[key]?.phase
        if (!phase) return fresh.has(key)
        return phase !== 'done' && phase !== 'failed'
      })

      if (active.length > 0 && (rounds -= 1) > 0) {
        timer = setTimeout(() => tick(active), 3000)
      }
    }

    tick(all)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobKeys, freshKeys])

  // Once a job reports done with a sha256, record it — the only moment it's
  // known for a video, since the source is gone right after, and for a photo
  // the browser did not hash itself. Idempotent (recordMediaHashAction just
  // re-writes the same value), so a rare double call from two renders in
  // flight at once costs nothing.
  useEffect(() => {
    for (const item of items) {
      if (item.sha256 || item.upload) continue
      const job = jobs[item.storageKey]
      if (job?.phase !== 'done' || !job.sha256) continue
      const sha256 = job.sha256
      const storageKey = item.storageKey
      recordMediaHashAction(storageKey, sha256)
        .then(({ duplicate }) => {
          setItems((prev) => prev.map((i) => (i.storageKey === storageKey ? { ...i, sha256 } : i)))
          if (duplicate) toast.warning(`This ${item.mediaType} looks identical to one already uploaded elsewhere.`)
        })
        .catch(() => { /* riprovato al prossimo render se lo stato del job resta */ })
    }
  }, [items, jobs])

  const effectiveOwnerId = useRef(
    ownerId !== 'new' ? ownerId : (() => {
      if (typeof window === 'undefined') return 'new'
      const k = '__media_tmp_id'
      if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, crypto.randomUUID())
      return sessionStorage.getItem(k)!
    })()
  ).current

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null)

  const uploadFile = useCallback(async (file: File, opts?: { skipDuplicateCheck?: boolean }) => {
    // By extension too: a browser reports no type at all for some containers
    // (.mkv on several platforms), and a video mistaken for a photo would be
    // refused as an unsupported photo format.
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTENSION.test(file.name)

    // A photo is hashed before a single byte moves, so an identical one can be
    // flagged while it costs nothing to stop. Hashing and the lookup are both a
    // courtesy: neither may ever be the reason a photo cannot be uploaded.
    let sha256: string | undefined
    if (!isVideo && file.size <= BROWSER_HASH_MAX_BYTES) {
      try {
        sha256 = await sha256HexOfFile(file)
      } catch (err) {
        console.error(err)
      }
      if (sha256 && !opts?.skipDuplicateCheck) {
        try {
          if ((await findDuplicateMediaAction(sha256)).duplicate) {
            setPendingDuplicate(file)
            return
          }
        } catch (err) {
          console.error(err)
        }
      }
    }

    // The key is known before a single byte moves, so the item can join the
    // list now and keep its identity all the way to "ready". It used to live in
    // a second list and be replaced on completion, which is what put a gap in
    // the middle of the journey.
    let key: string
    let url: string
    let contentType: string
    try {
      if (isVideo) {
        const result = await getVideoPresignedUploadUrl(effectiveOwnerId, file.name, file.type)
        key = result.key
        url = result.url
        contentType = file.type
      } else {
        const result = await getPresignedUploadUrl(effectiveOwnerId, file.name, file.type, 'photo')
        key = result.key
        url = result.url
        contentType = result.contentType
      }
    } catch (err) {
      console.error(err)
      toast.error(`Upload failed: ${file.name}`)
      return
    }

    // A TIFF or HEIC cannot be drawn by the browser: the thumbnail falls back to
    // an icon until the worker's result replaces it (see PhotoThumb).
    setItems((prev) => [...prev, {
      id: key,
      storageKey: key,
      mediaType: isVideo ? 'video' : 'photo',
      preview: isVideo ? '' : URL.createObjectURL(file),
      fileName: file.name,
      upload: { progress: 0 },
      sha256,
    }])

    const patch = (fields: Partial<MediaItem>) =>
      setItems((prev) => prev.map((i) => (i.storageKey === key ? { ...i, ...fields } : i)))

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        // Signed into the URL: it has to be exactly what the server chose.
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            patch({ upload: { progress: Math.round((e.loaded / e.total) * 100) } })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      // From here the bar belongs to the worker's status.
      patch({ upload: undefined })
    } catch (err) {
      console.error(err)
      toast.error(`Upload failed: ${file.name}`)
      patch({ upload: { progress: 0, failed: true } })
    }
  }, [effectiveOwnerId, getPresignedUploadUrl, getVideoPresignedUploadUrl])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    for (const file of acceptedFiles) uploadFile(file)
  }, [uploadFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // Exactly the formats the worker can decode, spelled out rather than as
    // `image/*`: what a wildcard means next to a list of extensions changed
    // between react-dropzone versions, and anything the worker cannot decode
    // would sit unprocessed forever. The extensions matter as much as the types:
    // Chrome on Windows reports no type at all for a HEIC file.
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tif', '.tiff'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
    },
    onDrop,
  })

  function handleDragEnd(event: { active: { id: string }; over: { id: string } | null }) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id)
        const newIndex = prev.findIndex((i) => i.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  // Only what has actually landed in storage is saved: a form submitted
  // mid-upload must not record a video that is not there.
  const mediaItemsJson = JSON.stringify(
    items
      .filter((i) => !i.upload)
      .map((i) => ({ key: i.storageKey, type: i.mediaType, sha256: i.sha256 }))
  )

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd as Parameters<typeof DndContext>[0]['onDragEnd']}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              job={jobs[item.storageKey]}
              onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Upload size={16} />
          <span>Add a photo or video (drag or click)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Photos: JPG, PNG, WebP, TIFF or HEIC</p>
        <p className="text-xs text-muted-foreground">After uploading, photos and videos are prepared for the site: this can take a few minutes</p>
      </div>

      <input type="hidden" name="mediaItems" value={mediaItemsJson} />

      <AlertDialog open={pendingDuplicate !== null} onOpenChange={(open) => !open && setPendingDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File already uploaded</AlertDialogTitle>
            <AlertDialogDescription>
              This photo is identical to one already elsewhere on the site. Upload it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDuplicate(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!pendingDuplicate) return
              const file = pendingDuplicate
              setPendingDuplicate(null)
              uploadFile(file, { skipDuplicateCheck: true })
            }}>
              Upload anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Verificare**

```bash
npx tsc --noEmit
npx eslint components/admin/media-upload.tsx lib/actions
```

Atteso: tsc pulito; eslint senza errori (restano due warning `no-unused-vars` per `_contentType`/`_type` in `bike-models.ts`: sono parametri posizionali tenuti per compatibilità con la firma che `MediaUpload` si aspetta, stessa natura del `_type` già presente).

- [ ] **Step 3: Commit (B4 + B5 insieme, così il branch compila)**

```bash
git branch --show-current
git add -A lib/actions components/admin/media-upload.tsx
git commit -m "Upload photos straight to staging, hash them in the browser, and follow the worker's progress"
```

### Task B6: i punti in cui il pubblico legge una foto

**Files:**
- Modify: `components/card-media.tsx`, `components/media-gallery.tsx`, `components/route-card-media-async.tsx`, `components/bike-card-media-async.tsx`, `lib/routes-data.ts`, `lib/bikes-data.ts`, `app/[lang]/routes/[id]/page.tsx`, `app/[lang]/bikes/[id]/page.tsx`

**Interfaces:**
- Consumes (da B1/B2): `photoUrl`, `resolveReadyMedia(items: Media[]): Promise<MediaWithHls[]>`.
- Produces: nessuna nuova API. Effetto: ogni foto in staging senza master è assente da `allMedia` e dalle card; ogni URL di foto passa da `photoUrl`.

- [ ] **Step 1: Client** — `components/card-media.tsx`: sostituire

```ts
import { r2PublicUrl } from '@/lib/r2'
import { hlsUrl, lowestBitrateLevel, type MediaWithHls } from '@/lib/media-client'
```

con `import { hlsUrl, photoUrl, lowestBitrateLevel, type MediaWithHls } from '@/lib/media-client'` e `src={r2PublicUrl(media.storageKey)}` con `src={photoUrl(media.storageKey)}`. Stessa sostituzione degli import in `components/media-gallery.tsx`, e:
`src={r2PublicUrl(item.storageKey)}` → `src={photoUrl(item.storageKey)}`;
``{ src: r2PublicUrl(m.storageKey), alt: m.altText ?? `${title}` }`` → ``{ src: photoUrl(m.storageKey), alt: m.altText ?? `${title}` }``.

- [ ] **Step 2: Server — card asincrone.** In `components/route-card-media-async.tsx` e `components/bike-card-media-async.tsx` sostituire `import { resolveHlsUrl } from '@/lib/media'` con `import { resolveReadyMedia } from '@/lib/media'` e il blocco

```ts
  const readyMedia = await Promise.all(
    mediaItems.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )
  const coverMedia = readyMedia.find(Boolean) ?? undefined
```

con:

```ts
  const [coverMedia] = await resolveReadyMedia(mediaItems)
```

(In `route-card-media-async.tsx` aggiornare anche il commento in testa: "skipping videos whose HLS isn't ready and photos the worker hasn't finished".)

- [ ] **Step 3: Server — dati cache-ati.** `lib/routes-data.ts`: `import { resolveHlsUrl } from '@/lib/media'` → `import { resolveReadyMedia } from '@/lib/media'` e sostituire il blocco da `// Exclude videos the worker hasn't finished…` a `.filter((m): m is NonNullable<typeof m> => m !== null)` con:

```ts
  // Exclude what the worker hasn't finished — videos and photos alike — and
  // carry the resolved manifest URL down so the client doesn't have to guess
  // which one exists. resolveReadyMedia and loadGpxPoints already have their own
  // durable, near-permanent Upstash cache (lib/cache.ts) — this "use cache"
  // wrapper is a thin, short-lived layer on top, not a replacement for it. It
  // is also why a photo that has just finished appears within its 30-120
  // seconds, without anything invalidating the tag.
  const allMedia = await resolveReadyMedia(permittedMedia)
```

`lib/bikes-data.ts`: stesso import e sostituire il blocco `const allMedia = (await Promise.all(rawMedia.map(…))).filter(…)` con `  const allMedia = await resolveReadyMedia(rawMedia)`.

- [ ] **Step 4: Pagine.** In `app/[lang]/routes/[id]/page.tsx` e `app/[lang]/bikes/[id]/page.tsx`: `import { r2PublicUrl } from '@/lib/r2'` → `import { photoUrl } from '@/lib/media-client'`; e le **due** occorrenze `r2PublicUrl(coverPhoto.storageKey)` (una in `generateMetadata`, una nel JSON-LD) → `photoUrl(coverPhoto.storageKey)`.

- [ ] **Step 5: Verificare che nessun lettore sia rimasto**

```powershell
Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,components,lib).FullName -Pattern "r2PublicUrl" | ForEach-Object { "$($_.Path):$($_.LineNumber)" }
```

Atteso: solo `lib/media.ts` (re-export), `lib/r2.ts` (definizione) e `lib/media.test.ts` (mock) — e `components/admin/photo-upload.tsx` finché B8 non lo elimina. Poi `npx tsc --noEmit` e `npx vitest run`: puliti.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add components lib app
git commit -m "Show a photo only once its master exists, everywhere the public reads one"
```

### Task B7: JPEG per le anteprime social (decisione D2 — saltabile insieme ad A3)

**Files:**
- Modify: `lib/media-client.ts`, `lib/media.ts`, `lib/media-client-photos.test.ts`, `lib/media.test.ts`, `app/[lang]/routes/[id]/page.tsx`, `app/[lang]/bikes/[id]/page.tsx`

**Interfaces:**
- Consumes (da B1/B2): `photoPublicKey`, `isStagedPhotoKey`, `mediaPublicUrl`, `deleteMediaFiles`.
- Produces: `photoShareKey(storageKey: string): string` (`private/…/{u}.jpg` → `public/…/{u}.share.jpg`; una chiave non in staging resta se stessa), `photoShareUrl(storageKey: string): string`. **Contratto con `share_key_for` del worker (A3).**

- [ ] **Step 1: Test (falliranno)** — in `lib/media-client-photos.test.ts` aggiungere `photoShareKey, photoShareUrl` all'import e, prima di `describe('isStagedPhotoKey', …)`:

```ts
// Same pairs as TestShare in the worker's tests/test_imaging.py.
describe('photoShareKey', () => {
  it('sits beside the master, as a JPEG', () => {
    expect(photoShareKey('private/route-photos/r1/u1.jpg')).toBe('public/route-photos/r1/u1.share.jpg')
    expect(photoShareKey('private/bike-model-photos/m1/u.2.tiff')).toBe('public/bike-model-photos/m1/u.2.share.jpg')
  })

  it('is the photo itself when it predates the worker', () => {
    expect(photoShareKey('route-photos/r1/u1.jpg')).toBe('route-photos/r1/u1.jpg')
    expect(photoShareUrl('route-photos/r1/u1.jpg').endsWith('/route-photos/r1/u1.jpg')).toBe(true)
  })
})

```

In `lib/media.test.ts` sostituire il primo test di `deleteMediaFiles` con:

```ts
  it('removes a staged photo\'s master and link preview along with its source', async () => {
    await deleteMediaFiles({ storageKey: 'private/route-photos/r1/u1.jpg', mediaType: 'photo' })
    expect(deleteR2Object.mock.calls.map((c) => c[0]).sort()).toEqual([
      'private/route-photos/r1/u1.jpg',
      'public/route-photos/r1/u1.avif',
      'public/route-photos/r1/u1.share.jpg',
    ])
  })
```

Eseguire `npx vitest run lib/media-client-photos.test.ts lib/media.test.ts` — atteso FAIL.

- [ ] **Step 2: Implementare.** In `lib/media-client.ts`, dopo `photoUrl`:

```ts
/**
 * The small JPEG the worker writes beside a staged photo's master, for link
 * previews only: WhatsApp, Facebook and LinkedIn do not read AVIF. A photo that
 * predates the worker is already a JPEG, PNG or WebP and stands in for itself.
 */
export function photoShareKey(storageKey: string): string {
  const key = photoPublicKey(storageKey)
  return isStagedPhotoKey(storageKey) ? key.replace(/\.avif$/, '.share.jpg') : key
}

export function photoShareUrl(storageKey: string): string {
  return mediaPublicUrl(photoShareKey(storageKey))
}
```

In `lib/media.ts`: nell'import da `./media-client` aggiungere `photoShareKey`; in `deleteMediaFiles` sostituire la riga `...(isStagedPhotoKey(m.storageKey) ? [deleteR2Object(photoPublicKey(m.storageKey))] : []),` con:

```ts
    ...(isStagedPhotoKey(m.storageKey)
      ? [deleteR2Object(photoPublicKey(m.storageKey)), deleteR2Object(photoShareKey(m.storageKey))]
      : []),
```

(e nel commento della funzione "its master" → "its master and its link-preview JPEG"). Nelle due pagine (`routes/[id]`, `bikes/[id]`): `import { photoUrl } from '@/lib/media-client'` → `import { photoShareUrl } from '@/lib/media-client'` e le due occorrenze `photoUrl(coverPhoto.storageKey)` → `photoShareUrl(coverPhoto.storageKey)` (og:image e JSON-LD).

- [ ] **Step 3: Verificare** — `npx vitest run` (162 test) e `npx tsc --noEmit`: puliti.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add lib app
git commit -m "Use the small JPEG, not the AVIF, for link previews and structured data"
```

### Task B8: pulizia — `/api/upload` solo GPX, codice morto, backfill

**Files:**
- Modify: `app/api/upload/route.ts`, `scripts/backfill-sha256.ts`, `lib/actions/routes.ts`
- Delete: `components/admin/photo-upload.tsx`

- [ ] **Step 1: Provare che è codice morto**

```powershell
Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,components,lib,scripts).FullName -Pattern "PhotoUpload|savePhotosAction|photo-upload" | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
```

Atteso: solo le definizioni (`photo-upload.tsx` e `savePhotosAction` in `lib/actions/routes.ts`), nessun importatore. Se ne compare uno, **fermarsi** e capire perché prima di cancellare.

- [ ] **Step 2: Eliminare** `components/admin/photo-upload.tsx` (`git rm`) e, in `lib/actions/routes.ts`, l'intera funzione `savePhotosAction` (l'ultima del file: scriveva chiavi senza passare dal worker ed è scritta per il componente appena eliminato).

- [ ] **Step 3: `/api/upload` solo GPX.** In `app/api/upload/route.ts`:

sostituire `findDuplicateOwner` con:

```ts
// GPX files only. Photos no longer pass through here: they go straight to
// storage for the worker to process (a 120 MB TIFF does not fit in a serverless
// request body), and their duplicate check moved to the browser — see
// lib/hash-client.ts. Leaving a photo path open would also let one skip the
// worker and land in the public prefix unprocessed.
async function findDuplicateGpxOwner(sha256: string) {
  const [match] = await db.select({ id: routes.id }).from(routes).where(eq(routes.gpxSha256, sha256)).limit(1)
  return match ? { routeId: match.id, bikeModelId: null as string | null } : null
}
```

`import { db, media, routes } from '@/lib/db'` → `import { db, routes } from '@/lib/db'`; sostituire

```ts
  const kindRaw = formData.get('kind') as string | null
  const force = formData.get('force') === 'true'
  const kind = kindRaw === 'photo' || kindRaw === 'gpx' ? kindRaw : null

  if (!file || !key) return new NextResponse('Missing file or key', { status: 400 })
```

con:

```ts
  const force = formData.get('force') === 'true'

  if (!file || !key) return new NextResponse('Missing file or key', { status: 400 })
  if (formData.get('kind') !== 'gpx') return new NextResponse('Only GPX files are uploaded here', { status: 400 })
```

e `if (kind && !force) { const owner = await findDuplicateOwner(kind, sha256)` con `if (!force) { const owner = await findDuplicateGpxOwner(sha256)`. `gpx-upload.tsx` invia già `kind=gpx`: non cambia.

- [ ] **Step 4: `scripts/backfill-sha256.ts`.** Nell'`import` dinamico di `media-client` aggiungere `isStagedPhotoKey`, e sostituire `const photoRows = mediaRows.filter((m) => m.mediaType === 'photo')` con:

```ts
  // A staged photo's file is the worker's AVIF master, not the source that was
  // uploaded, so hashing it would record a value no future upload can ever match.
  const photoRows = mediaRows.filter((m) => m.mediaType === 'photo' && !isStagedPhotoKey(m.storageKey))
```

- [ ] **Step 5: Verificare** — `npx tsc --noEmit`, `npx eslint app/api/upload/route.ts scripts/backfill-sha256.ts`, `npx vitest run`: puliti.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add -A app components lib scripts
git commit -m "Close the photo path in /api/upload and drop the code it left unused"
```

### Task B9: documentazione — solo ciò che il codice non dice

**Files:**
- Modify: `.claude/skills/media-storage/SKILL.md`, `docs/ai/STATE.md`
- Append: `docs/ai/journal/.notes`

- [ ] **Step 1: `.claude/skills/media-storage/SKILL.md`** — dopo la sezione "Prefissi del bucket — non è vera privacy" aggiungere:

```markdown
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
  staging quest'ultimo lascerebbe il master su R2 per sempre.
- Lo stato passa da `videojob:v1:<storage-key>` con le fasi dei video (`transcoding`
  incluso): il token del worker scrive solo lì, e una fase sconosciuta viene scartata da
  `parseStatus`.
- `/api/upload` è solo per il GPX. I duplicati di foto si controllano nel browser
  (`lib/hash-client.ts`).
```

- [ ] **Step 2: `docs/ai/STATE.md`** — nella sezione "Infrastruttura dei media", dopo il paragrafo sul worker aggiungere (tenere l'aggiunta sotto le ~10 righe):

```markdown
**Foto: stessa strada dei video, coda propria** (`image-process`, `jobs/image_process.py`).
Sorgenti in `private/route-photos/` e `private/bike-model-photos/`, master AVIF in
`public/…/<uuid>.avif` (Pillow + pillow-heif, non ffmpeg: verificato su Alpine amd64 e arm64).
Lo stato usa il prefisso `videojob:` dei video perché il token del worker scrive solo lì.
Le foto già pubblicate (chiave senza `private/`) non sono mai passate dal worker e restano
com'erano. Il pannello carica le foto con PUT presigned — `/api/upload` è solo GPX — e il
duplicato bloccante si controlla nel browser. Spec: `2026-09-23-image-processing-worker-design.md`
(con le correzioni del piano gemello).
```

e nella lista "Decisioni passate ancora rilevanti" aggiungere il puntatore alla spec e al piano.

- [ ] **Step 3: Journal** (regola di CLAUDE.md: una riga per decisione non ovvia, l'hook a fine sessione le assorbe). Appendere a `docs/ai/journal/.notes`:

```
Foto: la spec diceva "presigned diretto" ma /api/upload le riceveva (limite 4,5 MB Vercel): passate al PUT presigned, duplicati bloccanti spostati nel browser (hash crypto.subtle)
Foto: stato su videojob:v1 con fase "transcoding", non imagejob/"processing": il token del worker scrive solo videojob:*, parseStatus scarta le fasi ignote
Foto: Pillow+pillow-heif invece di ffmpeg (wheel musllinux aarch64/x86_64 verificati); I;16 → convert("RGB") satura a bianco, gestito in _to_encodable
Foto: og:image non legge AVIF su WhatsApp/Facebook → JPEG .share.jpg accanto al master (D2)
Foto: cancellare solo storageKey lascia il master AVIF su R2 → deleteMediaFiles
```

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add .claude docs
git commit -m "Document the photo pipeline: what the code does not say"
```

### Task B10: verifica dal vivo e misure (a mano — serve un admin loggato)

Il pannello non si può guidare senza credenziali admin: questo task lo esegue **l'utente**, oppure un agente con il suo accesso, contro il **Preview** della PR. Prerequisito: il worker con `image-process` in esecuzione e `R2_BUCKETS` che include il bucket del Preview.

- [ ] **Step 1: Caricare 4 foto da `/manage/routes/<id>`** (o da un modello di bici): il TIF da 120 MB, un HEIC da iPhone, un PNG con sfondo trasparente, un JPEG normale. Attendere per ciascuna: barra "Uploading" → "Waiting to be processed" → "Downloading" → "Processing" → "Saving" → "Ready", e la miniatura che passa da icona al master. Provare anche un `.gif`: **il dropzone deve rifiutarlo**.

- [ ] **Step 2: Controllare lo stato e i file** (sostituire `<uuid>` e `<route>` con quelli dell'elemento; `<base>` = dominio pubblico del bucket dell'ambiente):

```powershell
curl.exe -sI "<base>/public/route-photos/<route>/<uuid>.avif"        # 200, content-type: image/avif, cache-control: …immutable
curl.exe -sI "<base>/public/route-photos/<route>/<uuid>.share.jpg"   # 200, image/jpeg  (solo con D2)
curl.exe -sI "<base>/private/route-photos/<route>/<uuid>.tif"        # 404: il sorgente è stato cancellato
```

Stato del job (MCP `mcp__upstash__redis_run_command`): `GET videojob:v1:private/route-photos/<route>/<uuid>.tif` → `phase: done` con `sha256` di 64 caratteri, uguale a `Get-FileHash -Algorithm SHA256 <file originale>`.

- [ ] **Step 3: Misure** (CLAUDE.md: "misura prima di dichiarare finito" — qui il rischio è la richiesta più frequente del sito):
  1. Peso e dimensioni del master del TIF da 120 MB (`Content-Length` dal `curl -sI`, e larghezza/altezza dal log `RENDER` del worker) contro i 120 MB originali.
  2. **Tempi della pagina di un percorso con foto in staging**, 10 richieste a testa, Preview contro produzione: `curl.exe -s -o NUL -w "%{time_starttransfer}\n" "<url>/it/routes/<shortid>"`. `resolveReadyMedia` aggiunge una lettura Redis per foto in staging a ogni rigenerazione della cache (30 s): la mediana non deve peggiorare in modo misurabile.
  3. Prima richiesta di `/_next/image?url=<encoded master url>&w=640&q=68`: tempo e byte, contro la stessa foto servita dal vecchio file.

- [ ] **Step 4: Anteprima social** (D2): incollare l'URL del percorso nello Sharing Debugger di Facebook e in una chat WhatsApp; l'immagine deve comparire ed essere il `.share.jpg`. **Se comparisse anche con l'AVIF** (provando temporaneamente `photoUrl` in `generateMetadata`), D2 è ridondante e A3/B7 si possono eliminare.

- [ ] **Step 5: Cancellazione**: rimuovere una foto processata dal form e salvare; i tre URL del passo 2 devono rispondere 404. Rimuovere un'intera foto ancora "Processing" non deve dare errori nel pannello.

- [ ] **Step 6: Foto vecchie**: aprire un percorso e una bici con foto pubblicate *prima* di questo lavoro (chiave senza `private/`): devono comparire identiche a produzione, e nel pannello **senza** barra di avanzamento.

- [ ] **Step 7: PR — non mergiare.** `git push -u origin feat/photo-processing`, `gh pr create` con: correzioni alla spec, ordine di merge (worker prima), risultati delle misure. **Solo l'utente decide il merge**, dopo che il worker della Sezione A è già in esecuzione.

---

## Self-review (eseguita)

**Copertura della spec** — ogni requisito ha un task: tutte le foto passano dal worker (A2, B4, B5); master AVIF 2400 px (A1); sorgente cancellato (A2); formati ampliati (A1 allowlist, B1 estensioni, B5 dropzone); upload in staging privato (B4); worker trova il lavoro elencando R2 (A2 `pending`); SHA-256 prima di cancellare (A2, test dedicato) e integrazione col dedup (B3 `hash-client`, B4 `media-hash`, B5); stato via Upstash (A2, B3 `isTrackedJobKey`, B4 `media-jobs`); `resolveImageUrl` → `resolvePhotoUrl` (B2) e ogni punto di lettura (B6, con `grep` di verifica); "in elaborazione" nel pannello (B3, B5); foto non pronta non compare (B2, B6); "cosa non cambia" (nessuna migrazione: B1 distingue dalla chiave; Next/Image invariato; foto vecchie invariate: test B1/B2). Lacune trovate e chiuse: la cancellazione del master (punto 5), la CORS/HEIC/MIME vuoto (punto 6), la CI del worker senza test (A4), l'anteprima social (D2).

**Placeholder** — nessun "TBD/TODO"; l'unico valore non definitivo è `IMAGE_QUALITY=65`, dichiarato tale e con il task A5 che lo sostituisce. Le voci tra `<…>` (URL di PR, cartelle di foto, uuid) sono dati di esecuzione, non codice.

**Coerenza di nomi e tipi** — `output_key_for`/`share_key_for` (A1/A3) ↔ `photoPublicKey`/`photoShareKey` (B1/B7): stesse coppie pinnate nei due repo; `QUEUE = "image-process"` (A2) usato in `test_registry`; fasi `downloading → transcoding → uploading → done|failed` (A2) ⊂ `VIDEO_JOB_PHASES` (B3); `getPresignedUploadUrl` → `{url,key,contentType}` (B4) ↔ tipo della prop in `MediaUpload` (B5); `getMediaJobStatuses`/`recordMediaHashAction`/`findDuplicateMediaAction` (B4) ↔ import di B5; `resolveReadyMedia` (B2) ↔ B6; `deleteMediaFiles` (B2) ↔ B4; `mediaProgress(…, { awaiting })` (B3) ↔ B5.

**Verificato eseguendo, prima di scrivere il piano** (i blocchi di codice di queste sezioni sono quelli provati, non riscritti a mano): sezione A — 40 test verdi su `python:3.12-alpine` amd64, i 25 di `imaging` anche su arm64, `Dockerfile` reale costruito su arm64 con smoke test; sezione B — 162 test Vitest, `tsc --noEmit` e `eslint` puliti sul codice di B1–B8.
