# Search Console e Analytics — inventario e proposte

> Inventario del 2026-09-25, **solo lettura**: nulla è stato modificato su Google. Nasce dalla
> richiesta di Kevin ("su Search Console al momento c'è un bel casino", "su Analytics qualche
> dashboard"). Dati dei 90 giorni fino al 2026-09-25 per Search Console, 30 giorni per Analytics.

## Cosa c'è

**Search Console.** Una sola proprietà, di **dominio** (`sc-domain:lelettricaleoni.com`), che
copre `www`, l'apex e `staging`. Una mappa del sito (`https://www.lelettricaleoni.com/sitemap.xml`),
senza errori né avvisi; l'ultima lettura di Google è del 2026-09-24 con 42 URL, oggi la mappa ne ha
**54** (7 modelli di bici per tre lingue, più le liste e i percorsi). Il "casino" non è nella
configurazione: è nel come Google vede i due indirizzi, vedi sotto.

**Analytics (GA4).** Due proprietà nell'account `lelettrica`: `lelettricaleoni.com`
(`properties/328727214`, creata nel 2022, fuso Europe/Rome, EUR) e `Test-lelettricaleoni.com`
(`properties/534446246`). Il sito manda i dati solo in produzione e solo con il consenso ai cookie.

## Numeri

- **Ricerca (90 giorni):** 483 clic, 3.211 impressioni, CTR 15%, posizione media 5,3. Sano.
- **Chi ci cerca:** quasi solo per nome. "noleggio bici dro" (38 clic, posizione 1,4), "l'elettrica
  dro" (34, posizione 1), "lelettrica dro", "lelettrica", "negozio bici dro". Chi non ci conosce
  ci trova poco: "noleggio emtb", "noleggio gravel bike", "assistenza e-bike", "aggiusta bici
  vicino a me" hanno una sola impressione ciascuna.
- **Dispositivo e paese:** in Italia 353 clic su 418 da mobile. Su desktop la posizione media è
  **9,3** contro **3,9** su mobile. Poi Germania (27 clic, ricerche come "fahrrad verleih in der
  nähe"), Paesi Bassi, Belgio, Polonia, Austria, Svizzera.
- **Analytics (30 giorni):** 239 sessioni e 139 utenti (pochi, perché conta solo chi accetta i
  cookie). Ricerca organica 151 sessioni, diretto 79, referral 8, **assistenti AI 5**.
- **Contatti veri:** `phone_call` 22 volte da 19 utenti in 30 giorni; poi `download_gpx` 13,
  `get_directions` 4, `form_submit` 7, `flyover_start` 42.

## Cosa non va

1. **L'indirizzo senza `www` prende due terzi dei clic** (313 su 483) pur essendo un
   reindirizzamento: `https://lelettricaleoni.com/` → 308 → `https://www.lelettricaleoni.com/` → 301
   → `/it`. Due passaggi, e Google mostra nei risultati l'indirizzo di partenza. Search Console lo
   chiama "Page with redirect". Non è un errore, ma disperde: i clic su `/it` sono 125 e sembra
   la pagina meno importante.
2. **Il reindirizzamento della radice è un 301 (permanente) che dipende dalla lingua del
   browser** (`proxy.ts`, `getLocale(request)`). Un permanente che cambia con chi guarda è la
   combinazione sbagliata: i browser lo ricordano, quindi chi ha aperto `/` una volta con una
   lingua può restare su quella. Per Google, che non manda la lingua, equivale a un permanente verso
   `/it`. La forma corretta è un 307 temporaneo.
3. **`staging.lelettricaleoni.com` è comparso nei risultati** (9 impressioni, 1 clic). Oggi risponde
   con la pagina di accesso di Vercel, quindi non espone nulla, ma è un indirizzo che non dovrebbe
   stare negli indici.
4. **Nessuna dimensione personalizzata in Analytics.** Mandiamo una trentina di eventi con
   parametri (quale percorso, quale sezione, quale contatto, che lingua), ma senza registrarli come
   dimensioni i report non li possono usare: si vede *che* qualcuno ha telefonato, non *da dove*.
5. **Nessun evento chiave visibile.** Le telefonate, le email, le indicazioni stradali e i download
   GPX sono le azioni che contano per un negozio di noleggio, ma non risulta che siano segnate come
   conversioni. (Lo strumento a disposizione legge, non elenca gli eventi chiave: da verificare
   nell'interfaccia.)
6. **La proprietà `Test-` è probabilmente inutile**: il sito manda dati solo in produzione.
7. **Pagine di percorso con CTR basso:** `/it/routes/bdd7a446` ha 294 impressioni e 2,7% di CTR
   (posizione 8,7): compare, ma non convince. Titolo e descrizione sono da rivedere.
8. `/it/routes` è stata scansionata l'ultima volta il 2026-07-19: le liste vengono riviste poco.

## Cosa proporrei, in ordine

**Lo faccio io (codice, in una PR):**
- Root: da 301 a **307**, e in un solo salto dall'apex quando possibile (regola su Vercel: apex
  → `www` mantenendo il percorso, poi il proxy pensa alla lingua). Va provato: tocca la pagina che
  porta più traffico, quindi con misura prima e dopo.
- `staging`: `X-Robots-Tag: noindex` sull'host di staging, in aggiunta alla protezione di Vercel.
- Titolo e descrizione dei percorsi con parole che la gente cerca ("percorso in e-bike da Dro",
  "giro in gravel Lago di Garda"), a partire da `/it/routes/bdd7a446`.
- Dashboard nel pannello admin (`/manage/analytics`), letta dalle API di Analytics e Search
  Console: telefonate, indicazioni, GPX, sezioni più viste, canali, query, per periodo. Richiede
  le credenziali del service account su Vercel: una decisione di Kevin.

**Serve Kevin, dentro Google (non lo posso fare con gli strumenti che ho):**
- Analytics → Amministrazione → Definizioni personalizzate → creare le dimensioni degli eventi:
  `source`, `section_name`, `route_id`, `difficulty`, `bike_model_id`, `category`, `filter_type`,
  `filter_value`, `language`, `cta_name`, `link_domain`, `method`, `preview_mode`, `route`.
- Analytics → Eventi → segnare come **evento chiave**: `phone_call`, `email_click`,
  `get_directions`, `download_gpx`, `file_download`.
- Cancellare (o archiviare) la proprietà `Test-lelettricaleoni.com`.
- Search Console → Rimozioni → una richiesta temporanea per `staging.lelettricaleoni.com`.

**Contenuto, quando c'è tempo:** le ricerche che non ci trovano ("noleggio emtb", "noleggio gravel
bike", "riparazione e-bike") vogliono una pagina che risponda; le pagine delle bici (ora 7 modelli)
sono un inizio.
