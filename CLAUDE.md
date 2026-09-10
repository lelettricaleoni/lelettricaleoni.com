@AGENTS.md
@docs/ai/STATE.md
@docs/ai/ROADMAP.md

## Progetto
Sito di "Lelettrica di Leoni Gabriele" — noleggio e-bike (Flyer) + riparazioni, Dro (TN).
Stack: Next.js 16.2.4 · React 19 · Tailwind v4 · shadcn/ui · TypeScript · App Router.
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
- **Non usare il codice HTTP per stabilire se una pagina funziona.** Qui una sezione spenta
  risponde 200 (streaming + `notFound()`). Guarda il **contenuto**.
- **Misura prima di dichiarare finito.** Una migrazione "verificata" ha reso la home 40
  volte più lenta perché la verifica guardava solo la correttezza. Se tocchi qualcosa che
  sta sul percorso di ogni richiesta, misura i tempi prima e dopo.
- **Confronta con la produzione precedente**, non solo con il tuo locale.
- **Su Windows `pkill` non termina `next dev`.** Usa PowerShell sui PID, o resterai a
  parlare con un server vecchio credendo che sia quello nuovo.
- **Diffida di un output troncato.** Un `tail` su un `find` mi ha fatto affermare che un
  file non esisteva. Se una conclusione dipende da un elenco, verificalo mirato.

## Regole sempre valide
- **Server Action, non route handler.** Le rotte `app/api/` si aggiungono solo quando a
  chiamare è qualcosa che *non* è il nostro frontend — un servizio esterno, un webhook, il
  video worker — perché le Server Action si invocano con un id generato al build e non sono
  un'interfaccia pubblica stabile. Per tutto ciò che parte dal nostro client, Server Action.
- **Codice in inglese**: path URL, identificatori, funzioni, commenti. Solo i contenuti di
  `messages/{it,en,de}.json` sono in lingua.
- **Nessun CDN esterno**: tutto self-hosted, niente unpkg/cdnjs/jsdelivr. Eccezioni note e
  volute: tile delle mappe e analytics. Cesium è self-hosted in `public/cesium/`.
- **Librerie prima del custom**: prima di costruire un componente, cerca se esiste già in
  shadcn/ui o in una libreria consolidata. shadcn è il sistema UI primario.
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

## Next.js 16 — gotchas critici
- `middleware.ts` deprecato → usa `proxy.ts` con `export function proxy()`
- Root `app/layout.tsx` DEVE avere `<html>` e `<body>` — `return children` causa runtime error
- `params` / `searchParams` sono Promise → sempre `await params`
- `viewport` è export separato: `export const viewport: Viewport = { ... }`

## i18n — architettura adottata
- `proxy.ts` rileva locale, fa redirect, inietta header `x-locale` via `NextResponse.next({ request: { headers } })`
- `app/layout.tsx` legge `x-locale` con `await headers()` e imposta `<html lang>`
- `app/[lang]/layout.tsx` gestisce solo `generateMetadata` + `generateStaticParams`, restituisce `<>{children}</>`
- Dizionari in `messages/` caricati via `getDictionary(locale)` in `app/[lang]/dictionaries.ts` (con `server-only`)
- Dipendenze i18n: `negotiator`, `@formatjs/intl-localematcher`, `server-only`

## shadcn/ui
- `npx shadcn@latest init` è interattivo — preferire: crea `components.json` manualmente + `npx shadcn@latest add <componenti>`
- Installare anche: `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `lucide-react`
- `lucide-react` non include icone di brand (es. Instagram) → usare SVG inline

## Igiene del repository
- La root è per la configurazione, non per i file di lavoro: screenshot, dump, esportazioni e output di debug vanno nella cartella scratchpad di sessione, mai nel progetto
- Gli artefatti degli strumenti non si versionano: `.playwright-mcp/`, `temp/`, `.superpowers/`, `public/cesium/`
- Prima di committare guarda `git status`: se compare un file che non hai scritto di proposito, non aggiungerlo
- Se un file di scarto serve davvero, dagli una collocazione (`docs/`, `public/`) e un nome che dica cos'è — altrimenti cancellalo

## Comandi utili
- `npm run dev` — dev server su http://localhost:3000
- `npm run build` — verifica TypeScript + build produzione
