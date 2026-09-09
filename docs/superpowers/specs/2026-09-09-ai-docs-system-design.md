# Design Spec — Sistema di documentazione e memoria per agenti AI

**Data**: 2026-09-09
**Branch**: `main`
**Stato**: approvato, pronto per implementazione

---

## Obiettivo

Dare al repository un sistema di documentazione che sopravviva al tempo, pensato per essere caricato da agenti AI:

1. **Stato attuale** del progetto in un documento denso e verificato contro il codice
2. **Visione e funzionalità future** in un indice a orizzonti con schede di dettaglio
3. **Memoria delle sessioni AI** versionata nel repo invece che nella cartella utente
4. **Regole** ripartite fra sempre-attive (`CLAUDE.md`) e su richiesta (skill di progetto)

Il vincolo trasversale è il costo in token: ciò che entra in ogni sessione deve guadagnarsi il posto.

### Fuori scope

- Riscrittura del `README.md`. È il documento per lettori umani, è disallineato dal codice, e sistemarlo è un lavoro a sé. Viene registrato come debito noto in `STATE.md`.
- Migrazione delle spec e dei plan già presenti in `docs/superpowers/`. Restano dove sono.

---

## Il problema da risolvere

Lo stato di fatto al 2026-09-09:

| Sintomo | Evidenza |
|---|---|
| Il documento umano è marcito | `README.md` descrive `/percorsi`, `/manage/percorsi`, `/api/percorsi/[slug]/gpx` e `components/admin/admin-sidebar.tsx`. Il codice usa `/routes`, `/manage/routes`, `/api/routes/[id]/gpx`, e la sidebar non esiste più. Mancano Cesium, MapLibre, HLS, MinIO. |
| La memoria AI è fuori dal repo | `~/.claude/projects/C--GitHub-lelettricaleoni-com/memory/`, 6 file, 368 righe. Non versionata, non condivisa, invisibile a chi legge il progetto. |
| La memoria è pesante | `project_comingsoon.md` da solo è 174 righe e mescola fatti stabili, cronaca e dettagli già presenti nel codice. |
| Le decisioni passate non sono indicizzate | 4 plan e 2 spec in `docs/superpowers/` senza indice: nessuno le trova. |
| Le regole sono sparse | `AGENTS.md` (1 regola), `CLAUDE.md` (gotcha Next 16, i18n, shadcn), `feedback_*.md` (129 righe di preferenze). |

La causa comune: **nessun documento ha una regola di ammissione**. Tutto ciò che sembrava utile è finito ovunque, e quindi niente viene mantenuto.

---

## Architettura

```
docs/
  ai/
    STATE.md              # sempre in contesto — importato da CLAUDE.md
    ROADMAP.md            # sempre in contesto
    ideas/<slug>.md       # on-demand
    journal/
      YYYY-MM.md          # on-demand, append-only, uno per mese
      .notes              # effimero, gitignorato — ponte modello -> hook
  superpowers/            # invariato: spec e plan storici
.claude/
  skills/<nome>/SKILL.md  # regole di dominio, caricate su richiesta
  hooks/
    session-journal.mjs   # SessionEnd   -> scrive la voce di journal
    journal-reminder.mjs  # SessionStart -> segnala l'arretrato di distillazione
  commands/distill.md     # slash command /distill
  settings.json           # registra i due hook
CLAUDE.md                 # solo regole sempre-vere + puntatori
AGENTS.md                 # invariato
```

Lingua: prosa in italiano, nomi di file e cartelle in inglese — coerente con la regola esistente "codice in inglese, contenuti in lingua".

---

## Componenti

### 1. `docs/ai/STATE.md`

**Scopo.** Rispondere a "com'è fatto questo progetto adesso e perché" senza obbligare l'agente a esplorare.

**Regola di ammissione.** Entra **solo ciò che il codice non dice già**. È la regola che distingue questo file dal `README.md`: un elenco di componenti si ricava da `ls`, il motivo per cui i tile CARTO passano dal server no.

Contenuto:

- prodotto e destinatari, tre righe
- ambienti e branch: cosa è `main`, cosa è `staging`, dove sta il deploy
- superfici — rotte pubbliche, `/manage`, API — una riga di *scopo* ciascuna
- modello dati: tabelle, relazioni, dove vivono i media
- servizi esterni e cosa si degrada se uno cade
- decisioni vincolanti con il perché
- debito noto e trappole
- cosa non fare
- indice delle spec e dei plan storici in `docs/superpowers/` ancora rilevanti, una riga ciascuno — oggi non sono indicizzati e quindi nessuno li trova

Esplicitamente escluso: albero dei file, elenco componenti, tabella delle variabili d'ambiente, tabella degli eventi GA4. Sono già nel codice o nel README; duplicarli significa creare un secondo documento destinato a marcire.

**Dimensione obiettivo:** sotto le 150 righe. Se cresce oltre, è segno che è entrato qualcosa che il codice diceva già.

**Redazione.** Riscritto da zero verificando ogni affermazione contro il codice. `project_comingsoon.md` va usato come traccia degli argomenti, non come sorgente di verità.

### 2. `docs/ai/ROADMAP.md`

Quattro orizzonti, una riga per voce, link alla scheda quando esiste:

- **Adesso** — in lavorazione
- **Prossimo** — deciso, non iniziato
- **Un giorno** — idea non ancora decisa
- **Scartato** — con il motivo

L'orizzonte "Scartato" non è decorativo: impedisce a un agente di riproporre in buona fede un'idea già valutata e bocciata.

### 3. `docs/ai/ideas/<slug>.md`

Una scheda solo per le idee che meritano dettaglio. Struttura: problema, perché ora o perché non ora, vincoli, opzioni valutate, stato. Quando un'idea entra in implementazione diventa una spec in `docs/superpowers/specs/` e la scheda si riduce a un puntatore.

### 4. `docs/ai/journal/YYYY-MM.md`

Append-only, una voce per sessione, un file per mese. Formato di una voce:

```md
<!-- ts:2026-09-09T14:32:11Z -->
## 2026-09-09 · 3f8a2c1
**Branch:** main · **Intento:** documentare stato progetto e memorie AI
**File:** docs/ai/STATE.md, CLAUDE.md, .claude/hooks/session-journal.mjs (+3)
**Commit:** a1b2c3d Add AI docs system
**Note:**
- Scartato l'hook che riassume via `claude -p`: costa token e blocca la chiusura.
```

Il commento `<!-- ts:... -->` è l'ancora usata dalla distillazione per sapere cosa è già stato promosso.

In testa a ogni file mese, aggiornato da `/distill`:

```md
<!-- distilled-through: 2026-09-09T14:32:11Z -->
```

### 5. Hook `SessionEnd` — `.claude/hooks/session-journal.mjs`

**Perché uno script e non il modello.** L'hook gira quando la sessione è già chiusa: può registrare *cosa* è successo, non *perché*. Il "perché" arriva dal file `.notes` (componente 6).

Comportamento:

1. Legge il JSON su stdin (`session_id`, `transcript_path`, `cwd`, `reason`).
2. Legge il transcript JSONL e ne estrae, in modo difensivo:
   - la prima richiesta dell'utente, troncata a 200 caratteri
   - i percorsi passati a `Write` / `Edit` / `NotebookEdit`
   - gli hash e i soggetti dei commit creati durante la sessione
3. Legge il branch corrente da git.
4. Legge `docs/ai/journal/.notes` se esiste.
5. **Se non ci sono né file toccati, né commit, né note: esce con codice 0 senza scrivere.** È questa condizione che evita il rumore delle sessioni improduttive.
6. Altrimenti appende la voce a `docs/ai/journal/<YYYY-MM>.md`, creando il file se serve, e svuota `.notes`.

**Robustezza.** Il formato del transcript non è un'API stabile: ogni accesso a un campo è difensivo e qualsiasi eccezione viene inghiottita uscendo con codice 0. Un hook che fallisce non deve mai disturbare la chiusura di una sessione.

**Da verificare in implementazione:** lo schema esatto dell'input `SessionEnd` e la sintassi del blocco `hooks` in `settings.json`, contro la documentazione hook corrente. Non assumerlo a memoria.

### 6. `docs/ai/journal/.notes` — il ponte fra modello e hook

File di testo effimero, escluso dal versionamento con una riga mirata in `.gitignore` (`docs/ai/journal/.notes`) che non deve intercettare i file mese, che sono invece tracciati. Una regola in `CLAUDE.md` istruisce l'agente: quando prendi una decisione non ovvia, scarti un'alternativa, o scopri una trappola, appendi una riga qui. L'hook la assorbe nella voce di journal e svuota il file.

Risolve il limite strutturale dell'hook automatico senza chiedere a nessuno di ricordarsi un riepilogo di fine sessione.

### 7. Hook `SessionStart` — `.claude/hooks/journal-reminder.mjs`

L'output di `SessionEnd` non è visibile: il promemoria va messo all'avvio, dove lo stdout dell'hook entra nel contesto.

Conta le voci con `ts` successivo al massimo `distilled-through` fra i file mese. Se sono **più di 15**, stampa una riga che invita a lanciare `/distill`. Sotto soglia non stampa nulla. Come l'altro hook, qualsiasi errore esce in silenzio con codice 0.

### 8. Slash command `/distill` — `.claude/commands/distill.md`

1. Legge le voci di journal non ancora distillate.
2. Promuove in `STATE.md` i fatti che si sono stabilizzati, applicando la regola di ammissione: se il codice lo dice già, non entra.
3. Sposta in `ROADMAP.md` le idee emerse, nell'orizzonte giusto.
4. Aggiorna il marcatore `distilled-through` in testa a ogni file mese toccato.

Il journal grezzo non viene mai potato o riscritto: è l'archivio. `STATE.md` è il documento di lavoro.

### 9. Regole: `CLAUDE.md` e skill di progetto

`CLAUDE.md` conserva solo ciò che vale **sempre**, più i puntatori a `STATE.md` e `ROADMAP.md` e la regola su `.notes`. Le regole sempre-vere:

- codice, path URL, identificatori e commenti in inglese; solo `messages/` in IT/EN/DE
- nessun CDN esterno, tutto self-hosted (eccezioni note: tile mappe, analytics)
- preferire librerie consolidate al codice custom
- build e dev con `--webpack`
- su PowerShell usare `-LiteralPath`
- leggere `node_modules/next/dist/docs/` prima di scrivere codice Next

Le regole di dominio diventano skill in `.claude/skills/`, caricate solo quando il task le tocca:

| Skill | Copre |
|---|---|
| `nextjs-16` | `proxy.ts` al posto di `middleware.ts`, `params`/`searchParams` come Promise, `viewport` come export separato, `<html>`/`<body>` obbligatori nel layout root |
| `i18n` | architettura IT/EN/DE, header `x-locale`, `getDictionary`, aggiunta di stringhe, Azure Translator per i percorsi |
| `db-migrations` | schema Drizzle, `drizzle-kit generate`/`migrate`, `DATABASE_URL` vs `DATABASE_DIRECT_URL`, Supabase Auth e `user_metadata.role` |
| `media-storage` | R2 e MinIO, presigned URL, HLS, watermark GPX on-the-fly |
| `maps` | Cesium self-hosted in `public/cesium/`, MapLibre, proxy dei tile CARTO, `gpx-svg` |

Ogni skill dichiara nel `description` del frontmatter i propri trigger, così viene invocata quando serve senza pesare quando non serve.

### 10. Migrazione della memoria esistente

| Origine | Destinazione |
|---|---|
| `project_comingsoon.md` (174 righe) | `STATE.md`, **riscritto e verificato riga per riga contro il codice** |
| `feedback_preferences.md` | ripartito fra regole sempre-vere in `CLAUDE.md` e skill di dominio |
| `feedback_no_cdn.md` | regola sempre-vera in `CLAUDE.md` |
| `feedback_english_code.md` | regola sempre-vera in `CLAUDE.md` |
| `user_profile.md` | **resta dov'è** — descrive l'utente, non il progetto |
| `MEMORY.md` | ridotto a un puntatore verso `docs/ai/` |

---

## Flusso dei dati

```
sessione di lavoro
   |
   +- l'agente carica CLAUDE.md -> STATE.md, ROADMAP.md
   +- se il task tocca un dominio -> invoca la skill relativa
   +- decisione non ovvia -> appende una riga a journal/.notes
   |
   +- SessionEnd -> session-journal.mjs
         legge transcript + git + .notes
         se c'è sostanza -> appende voce a journal/YYYY-MM.md, svuota .notes
         altrimenti      -> esce in silenzio

sessione successiva
   |
   +- SessionStart -> journal-reminder.mjs
         voci non distillate > 15 -> suggerisce /distill

/distill
   +- journal -> STATE.md (fatti stabili) + ROADMAP.md (idee)
      aggiorna distilled-through
```

---

## Gestione degli errori

Gli hook sono codice che gira ai bordi di ogni sessione: un loro fallimento non deve mai propagarsi.

- Ogni hook avvolge tutto il proprio corpo in un `try`/`catch` che esce con codice 0.
- Transcript mancante, illeggibile o in un formato inatteso: si procede con i soli dati disponibili da git.
- `docs/ai/journal/` mancante: viene creata.
- Repository non-git o `git` non disponibile: il campo branch resta vuoto, la voce si scrive lo stesso.
- `.notes` mancante: la sezione Note viene omessa.

---

## Test

Le componenti verificabili sono i due hook; il resto sono documenti.

- `session-journal.mjs`: transcript di esempio produce la voce attesa; transcript senza modifiche non scrive nulla; transcript malformato esce 0 senza scrivere; `.notes` presente produce note incluse e file svuotato.
- `journal-reminder.mjs`: journal sotto soglia non produce output; sopra soglia produce una riga; cartella journal assente non produce output ed esce 0.

I test vivono accanto agli hook e girano con `vitest`, già presente nel progetto.

Verifica manuale a fine implementazione: aprire una sessione, modificare un file, chiuderla, controllare che la voce sia comparsa in `docs/ai/journal/`.

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| `STATE.md` diventa il nuovo README marcio | La regola di ammissione e il tetto di 150 righe. Se il documento cresce, è il segnale che la regola non è stata applicata. |
| Il formato del transcript cambia | Parsing difensivo; la voce si scrive lo stesso con i dati da git. |
| L'agente non appende mai a `.notes` | Le voci restano fattuali ma corrette: degradazione morbida, non rottura. |
| Il journal cresce senza controllo | Un file per mese, caricato solo su richiesta; `/distill` estrae ciò che conta. |
