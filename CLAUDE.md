@AGENTS.md
@docs/ai/STATE.md
@docs/ai/ROADMAP.md

## Progetto
Sito di "Lelettrica di Leoni Gabriele" — noleggio e-bike (Flyer) + riparazioni, Dro (TN).
Stack: Next.js 16.3.4 · React 19 · Tailwind v4 · shadcn/ui · TypeScript · App Router.
i18n nativo (IT/EN/DE): `proxy.ts` + `app/[lang]/` + `messages/{it,en,de}.json`.

Lo stato corrente, le decisioni vincolanti e le trappole stanno in `docs/ai/STATE.md`,
importato qui sopra. Non duplicarli in questo file.

## Memoria delle sessioni
- Quando prendi una **decisione non ovvia**, scarti un'alternativa o scopri una trappola,
  appendi una riga a `docs/ai/journal/.notes`. Un hook a fine sessione la assorbe nella
  voce di journal e svuota il file: è l'unico modo perché il *perché* sopravviva, dato che
  l'hook conosce solo il *cosa*.
- Il journal è in `docs/ai/journal/YYYY-MM.md`, append-only. Non riscriverlo a mano.
- Quando le voci non distillate si accumulano, un hook all'avvio lo segnala: usa `/distill`
  per promuovere i fatti stabili in `STATE.md` e le idee in `ROADMAP.md`.

## Verifica — regole nate da errori veri
- **Non usare il codice HTTP per stabilire se una pagina funziona.** Qui una pagina che chiama
  `notFound()` dopo lo streaming risponde 200. Guarda il **contenuto**.
- **Misura prima di dichiarare finito.** Una migrazione "verificata" ha reso la home 40
  volte più lenta perché la verifica guardava solo la correttezza. Se tocchi qualcosa che
  sta sul percorso di ogni richiesta, misura i tempi prima e dopo.
- **Confronta con la produzione precedente**, non solo con il tuo locale.
- **Su Windows `pkill` non termina `next dev`.** Usa PowerShell sui PID, o resterai a
  parlare con un server vecchio credendo che sia quello nuovo.
- **Diffida di un output troncato.** Un `tail` su un `find` mi ha fatto affermare che un
  file non esisteva. Se una conclusione dipende da un elenco, verificalo mirato.

## Regole sempre valide
- **Mai commit diretti su `main` o `staging`.** Ogni modifica passa da una PR, anche una
  riga di documentazione: la CI costa quaranta secondi. La protezione su GitHub vale anche
  per gli amministratori (dal 2026-09-16: prima li esentava e dei push diretti sono finiti
  su `main`), quindi un push diretto viene rifiutato. `.githooks/pre-commit` ferma l'errore
  prima, già al commit, in locale: si attiva con `git config core.hooksPath .githooks` (va
  rifatto su ogni clone nuovo). Prima di committare, `git branch --show-current`.
- **Dopo aver aperto una PR non aspettare i check**: niente `gh pr checks --watch` né cicli
  di attesa che bloccano la sessione (Kevin, 2026-10-02). Passa ad altro e unisci dopo, oppure
  lancia in background un controllo che unisce solo se tutti i check passano sullo stesso
  commit (`headRefOid`) e cancella il branch solo dopo aver letto `MERGED`. L'auto-merge di
  GitHub non è abilitato sul repo.
- **Server Action, non route handler.** Le rotte `app/api/` si aggiungono solo quando a
  chiamare è qualcosa che *non* è il nostro frontend — un servizio esterno, un webhook, il
  video worker — perché le Server Action si invocano con un id generato al build e non sono
  un'interfaccia pubblica stabile. Per tutto ciò che parte dal nostro client, Server Action.
- **Nessun dettaglio infrastrutturale nei testi che l'utente legge.** L'interfaccia dice
  cosa succede e perché conta per chi la usa, mai dove finiscono i file o con quale
  tecnologia: "Foto su R2, video su MinIO" non aiuta nessuno a caricare un video, e invecchia
  male — quella riga è rimasta a nominare MinIO per un giorno dopo che era stato spento.
  Vale per il pannello quanto per le pagine pubbliche.
- **Codice in inglese**: path URL, identificatori, funzioni, commenti. Vale anche per i
  testi dell'interfaccia del pannello admin (etichette, bottoni, titoli) — il pannello non
  è mai tradotto, a differenza del sito pubblico. Solo i contenuti di
  `messages/{it,en,de}.json` sono in lingua.
- **Nessun CDN esterno**: tutto self-hosted, niente unpkg/cdnjs/jsdelivr. Eccezioni note e
  volute: tile delle mappe e analytics. Cesium è self-hosted in `public/cesium/`.
- **Librerie prima del custom, sempre** (Kevin, 2026-10-02): per qualunque cosa non banale
  — componenti, date e fusi orari, validazione di input, parsing, formati, telefoni, URL,
  soldi, crittografia, autenticazione — cerca prima una libreria consolidata e usala. Non
  scrivere a mano regex di validazione né aritmetica sulle date: una libreria che esiste da
  anni ha già risolto casi limite che non rifaremo mai alla perfezione, e ci fa scrivere
  meno codice. Se nel progetto ce n'è già una, si usa quella. Scelte fatte: `zod` per la
  validazione (`z.email()`, `z.uuid()`, `z.iso.date()`…), `date-fns` 4 con `@date-fns/tz`
  per le date (da installare con la prima fetta delle prenotazioni; le date di calendario
  viaggiano come stringhe `YYYY-MM-DD` e «oggi» si calcola in `Europe/Rome`), e
  `libphonenumber-js` per i telefoni. shadcn è il sistema UI primario.
- **`--webpack`, mai Turbopack**: `next dev --webpack` e `next build --webpack`. Non esiste
  `--no-turbopack`.
- **Niente `next-seo`**: è per il Pages Router. Usa l'API `Metadata` nativa e JSON-LD.
- **PowerShell: `-LiteralPath`** per i percorsi con parentesi quadre, altrimenti `[id]`
  viene interpretato come glob.
- **`temp/` è la cartella di scambio con Kevin** (export, CSV, immagini da analizzare). I
  file di lavoro tuoi vanno invece nello scratchpad di sessione. Entrambi fuori da git.

## Trappole di implementazione già pagate
- **`createPortal` per overlay fissi dentro un elemento con `backdrop-filter`**: quel
  filtro crea un containing block, quindi un `position: fixed` figlio resta confinato lì
  invece di coprire il viewport.
- **Cambio lingua lato client**: deriva il locale da `usePathname()`, non dai prop del
  server. Il layout radice non si ri-renderizza durante la navigazione client, e un
  `router.refresh()` non è una soluzione accettabile.
- **Short ID dei percorsi**: `shortRouteId(uuid) = uuid.slice(0, 8)`, lookup con
  ``sql`left(${routes.id}::text, 8) = ${shortId}` ``.

## Regole di dominio come skill
Next.js 16 (routing, Cache Components, trappole verificate) e i18n (architettura, come
aggiungere stringhe) sono skill di progetto — `.claude/skills/nextjs-16/`,
`.claude/skills/i18n/`, `.claude/skills/db-migrations/`, `.claude/skills/media-storage/`,
`.claude/skills/maps/`, `.claude/skills/privacy-cookies/`, `.claude/skills/cookie-consent/`, `.claude/skills/design-system/` — caricate su richiesta invece che
sempre, così non pesano quando il task non le tocca.

**Ogni lavoro visivo parte da `design-system`** (Kevin, 2026-10-07): raggi, colori, componenti e misure già decisi dal sito.
Prima di fare un pulsante, un menu o una card si cerca quello che esiste (`components/ui/`); niente esadecimali nuovi nel
markup (ci sono i token `brand-*`); un'azione non è mai una pillola. Si guarda uno screenshot prima di dire «finito».

**Privacy e cookie sono parte del lavoro, e si pensano prima** (Kevin, 2026-10-07: «devi andarci
preventivo con la privacy», e lo stesso per i cookie). Se una modifica raccoglie o mostra dati di una
persona, imposta un cookie, chiama un servizio esterno dal browser o cambia chi ospita il sito,
carica **prima di scrivere il codice** le skill `privacy-cookies` (informativa, cinque domande
preventive) e `cookie-consent` (banner, consenso, verifica con un browser vero) e aggiorna nella
stessa PR l'informativa (`messages/*.json`) e il banner (`components/cookie-consent.tsx`), oppure
scrivi nella PR cosa manca e mettilo in ROADMAP come bloccante per il rilascio. In CI due guardie
(`lib/privacy-surface.test.ts`) fermano un host, un cookie o uno storage nuovi non dichiarati.
Nei log non entrano mai dati di persone: per gli errori di una query, `safeErrorSummary`.

## shadcn/ui
- `npx shadcn@latest init` è interattivo — preferire: crea `components.json` manualmente + `npx shadcn@latest add <componenti>`
- Installare anche: `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `react-icons`
- Le icone sono tutte `react-icons` (Lucide è `react-icons/lu`, i loghi `react-icons/si`): **`lucide-react` non c'è più**, e un
  componente scritto da `shadcn add` che lo importa va riscritto con `react-icons/lu` (vedi la skill `design-system`)

## Igiene del repository
- La root è per la configurazione, non per i file di lavoro: screenshot, dump, esportazioni e output di debug vanno nella cartella scratchpad di sessione, mai nel progetto
- Gli artefatti degli strumenti non si versionano: `.playwright-mcp/`, `temp/`, `.superpowers/`, `public/cesium/`
- Prima di committare guarda `git status`: se compare un file che non hai scritto di proposito, non aggiungerlo
- Se un file di scarto serve davvero, dagli una collocazione (`docs/`, `public/`) e un nome che dica cos'è — altrimenti cancellalo

## Comandi utili
- `npm run dev` — dev server su http://localhost:3000
- `npm run build` — verifica TypeScript + build produzione
