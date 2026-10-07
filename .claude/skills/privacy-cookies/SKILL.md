---
name: privacy-cookies
description: "Use when a change collects, stores, shows or sends to a third party any personal data, or sets a cookie / localStorage / a request from the visitor's browser to another service: a new form or field, accounts and sign-in (Supabase Auth, Google), customers and rentals, emails, analytics events, a new third-party script, map or font, a new provider (payments, email, storage, hosting), or a change of where the site runs. Also when editing the privacy policy (messages/*.json, privacy), the cookie banner (components/cookie-consent.tsx) or Google Consent Mode. Triggers: touching app/[lang]/privacy, messages privacy keys, cookie-consent.tsx, lib/analytics.ts, lib/customers.ts, lib/auth/, lib/supabase/, a new NEXT_PUBLIC_ variable pointing at another service."
---

# Privacy e cookie in questo progetto

**Regola madre (Kevin, 2026-10-07: «bisogna assolutamente modificare le privacy e i cookie»):** un
cambiamento che tocca dati personali o cookie **non è finito** finché l'informativa e il banner non dicono
la verità su di lui. Nella stessa PR si aggiornano i testi (o si scrive nella PR cosa resta da fare e perché,
e lo si mette in `docs/ai/ROADMAP.md` come **bloccante per il rilascio**). Non si rimanda in silenzio.

**Non è consulenza legale.** I testi si scrivono come **bozza vera sui fatti** e si segnalano a Kevin come
«da far rivedere». Non si inventano basi giuridiche, tempi di conservazione o clausole: dove il fatto non è
noto si lascia la domanda aperta (elenco in fondo). Mai un testo definitivo scritto «a sentimento».

## Dove stanno i testi

| Cosa | Dove |
|---|---|
| Informativa privacy (le tre lingue) | `messages/{it,en,de}.json`, sezione `privacy` (titoli e corpi); pagina `app/[lang]/privacy/page.tsx` |
| Titolare, indirizzo, email di contatto della pagina privacy | scritti **a mano** in `app/[lang]/privacy/page.tsx` (vedi `docs/contact-details.md`) |
| Banner dei cookie | `components/cookie-consent.tsx` (vanilla-cookieconsent 3). **I testi stanno dentro il componente**, non in `messages/`: sono tre blocchi (it, en, de) da tenere uguali. Categorie: `necessary`, `analytics` |
| Cookie del banner | `cc_cookie`, 182 giorni (impostazione predefinita della libreria; nessuna modifica nel codice) |
| Analytics | GA4 con **Consent Mode v2**, tutto negato di partenza (`app/[lang]/layout.tsx`, `gtag('consent','default',…)`); lo script `googletagmanager.com/gtag/js` si carica comunque, prima del consenso |
| «Impostazioni cookie» | pulsante nel footer (`components/footer.tsx`) |
| Test | `lib/privacy-text.test.ts` (l'informativa non nomina chi non ospita più il sito) |

## Cosa tratta il sito (inventario, aggiornato il 2026-10-07)

Aggiornalo quando cambia. È la base per scrivere i testi, non il testo.

- **Ogni visitatore**: indirizzo IP e header HTTP, trattati da **Cloudflare** (DNS, protezione dagli attacchi, memoria
  temporanea dei file, tunnel verso il server) e dal **server su Oracle Cloud Infrastructure, Milano** (`eu-milan-1`).
- **Analytics**: GA4, solo con il consenso (cookie `_ga`, `_ga_*`), Google LLC come fornitore. Conservazione 14 mesi
  (impostazione di GA4).
- **Mappa di Google** (sezione contatti): non si carica finché la persona non clicca «carica la mappa»; dopo il clic Google
  può impostare i suoi cookie. L'avviso è nel componente (`map-embed.tsx`).
- **Mappa 3D dei percorsi**: il browser contatta **direttamente** Esri (`services.arcgisonline.com`, immagini) e
  Cesium ion (terreno): a loro arriva l'IP del visitatore, senza consenso. Va dichiarato. I tile CARTO invece passano
  dal nostro server e non espongono il visitatore.
- **Account dei clienti** (fetta 2, su `staging`, non ancora in produzione): **Supabase Auth** (progetto in Irlanda,
  `eu-west-1`): email, password (conservata cifrata, mai in chiaro), nome e cognome nei metadati dell'account; il cliente
  nella tabella `customers` (nome, cognome, email, telefono facoltativo). **Cookie di sessione, prima parte e necessari**:
  `sb-<progetto>-auth-token` (spezzato in `.0`, `.1` se grande) e `sb-<progetto>-auth-token-code-verifier`, durata 400
  giorni (predefinita di `@supabase/ssr`). Se si attiva Google: Google LLC fornisce l'accesso, e il numero di telefono
  solo con il permesso sensibile `user.phonenumbers.read` (interruttore `GOOGLE_LOGIN_PHONE`).
- **Clienti e noleggi registrati al banco**: tabelle `customers`, `bike_reservations` (nome, contatti, date, importi,
  note). Non passano dal sito pubblico; li inserisce il pannello. Base giuridica e conservazione: **da definire**.
- **Pannello (solo staff)**: Azure Translator riceve i testi del catalogo (percorsi e modelli), **non** dati dei clienti;
  la sincronizzazione con Google Calendar manda un evento per prenotazione (nome del cliente; il telefono solo se
  l'amministratore lo abilita; mai importi né note).
- **Da arrivare**: Stripe (pagamenti: titolare autonomo del dato di pagamento), email di servizio e promemoria
  (fornitore da indicare), appuntamenti di riparazione.

## Checklist quando si aggiunge qualcosa

1. **Un campo con dati di una persona** (nome, contatto, indirizzo, foto): chi lo vede, dove si conserva, per quanto,
   come lo si cancella o esporta. Se l'informativa non lo nomina, va aggiunto.
2. **Un servizio esterno** (script, font, mappa, immagini, API chiamata dal browser): il browser gli manda l'IP.
   Vale come destinatario: nominarlo nell'informativa e decidere se serve il consenso (la mappa di Google lo ha con il
   clic; Esri e Cesium oggi no).
3. **Un cookie, `localStorage` o `sessionStorage`**: aggiungerlo alla tabella del banner nella categoria giusta
   (`necessary` solo se senza di lui il servizio richiesto non funziona) **in tutte e tre le lingue**.
   `lib/stale-action.ts` usa `sessionStorage` solo per un contatore tecnico di 10 secondi (nessun dato personale).
4. **Eventi di Analytics**: `trackEvent` non deve mai ricevere email, telefono, nomi o id dell'account. Solo
   categorie (`source`, `mode`, `language`).
5. **Email**: quelle di servizio (conferma, reset) sono necessarie; qualunque comunicazione promozionale richiede
   un consenso a parte, mai incluso nell'accettazione della privacy.
6. **Un cambio di dove gira il sito o di chi lo ospita**: l'informativa nomina il fornitore. Si è già sbagliato una volta
   (diceva Vercel per tre settimane dopo il passaggio al server proprio): aggiornare il paragrafo dei destinatari **nella
   stessa PR** dello spostamento.
7. **Aggiornare «Ultimo aggiornamento»** (`privacy.last_updated`) a ogni modifica.

## Trappole

- **Il banner e l'informativa dicono due volte la stessa cosa** (tre lingue ciascuno): cambiarne uno e non l'altro è
  l'errore più facile. Cercare la parola in tutto `messages/` **e** in `components/cookie-consent.tsx`.
- **`user_metadata` lo scrive l'utente** (nomi dalla registrazione): non è un dato affidabile e non è un permesso
  (`lib/admin-users.ts`).
- **Il GDPR non è solo il banner**: i dati dei clienti del banco (`customers`) hanno bisogno dell'informativa anche se
  non passano dal sito. Oggi la pagina privacy non li descrive.
- **Il telefono di Google** richiede la verifica dell'app da parte di Google e, per la maggior parte degli account, non
  c'è nulla da restituire: un campo vuoto è il caso normale.

## Domande aperte per un legale

Da portare a chi rivede i testi, finché non hanno risposta:

1. Per quanto tempo si conservano i dati dei clienti del banco e degli account (e dei documenti fiscali)?
2. Il noleggio al banco ha un'informativa data alla persona (a voce, su carta)? Il sito la richiama?
3. Contratti con i fornitori (Cloudflare, Oracle, Supabase, Google, il fornitore delle email): accordi sul trattamento
   (art. 28) e trasferimenti fuori dall'UE (Cloudflare e Google negli USA: Data Privacy Framework).
4. Serve il registro dei trattamenti (art. 30)?
5. Base giuridica dei dati dell'account (esecuzione del contratto di noleggio) e dell'email di servizio.
6. Cesium ion e Esri ricevono l'IP senza consenso: va bene dichiararli nell'informativa, o servono dietro il banner?
7. Lo script di Google Analytics si carica prima del consenso (anche con Consent Mode negato): è accettabile?
