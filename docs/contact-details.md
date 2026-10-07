# Dati di contatto e dati dell'attività: dove sono scritti

Aggiornato il 2026-10-07. **Non c'è una fonte unica**: telefono, email, indirizzo e partita IVA sono scritti a mano nei
componenti, e alcuni anche nei dati strutturati e nei PDF. Questa pagina dice dove, e cosa toccare quando un dato cambia.
I numeri di riga sono quelli del 2026-10-07: se si spostano, cerca la stringa (comando in fondo).

## Cosa il sito mostra

| Dato | Valore | Dove è scritto |
|---|---|---|
| **Nome** | Lelettrica di Leoni Gabriele | dati strutturati `app/[lang]/layout.tsx:192`; autore `:140`; marchio `app/[lang]/bikes/[id]/page.tsx:102`; fornitore `app/[lang]/routes/[id]/page.tsx:112`. Alias nei dati strutturati (`layout.tsx:193`): «Lelettrica», «L'Elettrica Leoni» |
| **Ragione sociale e P.IVA** | LELETTRICA DI LEONI GABRIELE, P.IVA 02622600225 | `components/footer.tsx:102` (solo lì). L'etichetta «P.IVA» è tradotta: `messages/*.json`, chiave `footer.vat` |
| **Titolare dei dati** | Leoni Gabriele, Via Roma 90, 38074 Dro (TN), Italia, info@lelettricaleoni.com | `app/[lang]/privacy/page.tsx:69-70`, scritto a mano, uguale nelle tre lingue |
| **Indirizzo** | Via Roma 90, 38074 Dro (TN), Italia | `components/footer.tsx:63`; `components/hero-section.tsx:87`; `components/map-section.tsx:47` (campo copiabile) e `:30` (link alle indicazioni stradali); `components/not-found-page.tsx:54`; `app/[lang]/privacy/page.tsx:69`; dati strutturati `app/[lang]/layout.tsx:205-208` (diviso in campi); parole chiave `layout.tsx:138` |
| **Telefono** | +39 338 123 2434 (nel link: `tel:+393381232434`) | `components/footer.tsx:66,70`; `components/hero-section.tsx:92,118`; `components/map-section.tsx:54,58`; `components/not-found-page.tsx:45,54`; `components/bike-contact-buttons.tsx:11`; `app/[lang]/[slug]/page.tsx:72` (pagine di servizio); dati strutturati `app/[lang]/layout.tsx:196`. **Anche nei PDF** (vedi sotto) |
| **Email visibile** | info@lelettricaleoni.com | `components/footer.tsx:74,78`; `components/map-section.tsx:67,71`; `components/bike-contact-buttons.tsx:16`; `app/[lang]/privacy/page.tsx:70,103,104`; `messages/{it,en,de}.json:151` (`privacy.contact_body`, dentro la frase tradotta); dati strutturati `app/[lang]/layout.tsx:197` |
| **Email di sicurezza** | security@lelettricaleoni.com | `public/.well-known/security.txt` (solo lì) |
| **Orari** | Tutti i giorni 09:00–13:00 e 14:00–19:00 | `messages/{it,en,de}.json`, chiave `info.hours_value` (mostrata da `hero-section.tsx:97` e `map-section.tsx:78`); dati strutturati `app/[lang]/layout.tsx:217-229` (due fasce); descrizioni per i motori `layout.tsx:44-46` (dicono «09:00–19:00», senza la pausa). `pricing.afternoon` è la fascia del prezzo del pomeriggio, non l'orario di apertura |
| **Social** | Instagram @lelettricaleoni | `components/footer.tsx:85`; dati strutturati `layout.tsx:232`. **Facebook** (`facebook.com/lelettricaleoni`) è solo nei dati strutturati, `layout.tsx:233`: non si vede nel sito |
| **Mappa** | coordinate 45.958900, 10.904293 | dati strutturati `layout.tsx:211-216` (`geo`, `hasMap`); incorporata in `components/map-embed.tsx:9-11`, con la variabile `NEXT_PUBLIC_MAPS_EMBED_URL` (vedi `docs/environment-variables.md`) |
| **Indirizzo del sito** | https://www.lelettricaleoni.com | variabile `NEXT_PUBLIC_SITE_URL` |

I «dati strutturati» sono il blocco JSON-LD che `app/[lang]/layout.tsx` mette in ogni pagina per i motori di ricerca: un
visitatore non lo vede, un robot lo legge per intero.

## Fuori dal codice

- **Gli alias di posta** si gestiscono su Cloudflare, *Email Routing* della zona `lelettricaleoni.com`, non nel repository:
  `info@`, `gabriele@` e `security@` inoltrano alla casella del titolare. `gabriele@` non compare nel sito.
- **Google Business Profile** ha una sua copia di telefono, orari, indirizzo e sito: va aggiornata a mano insieme al sito.

## I file serviti dalla radice del sito (`public/`)

| File | Collegato dal sito | Contiene |
|---|---|---|
| `/pdf/Volantino 2026.pdf` | sì, il pulsante «Scarica il volantino prezzi» (`components/pricing-section.tsx:196`) | prezzi, telefono +39 338 1232434, `www.lelettricaleoni.com`. Nessuna email |
| `/llms.txt` | no (lo leggono i modelli linguistici) | nome, indirizzo, link; niente telefono né email |
| `/.well-known/security.txt` | no (lo leggono i ricercatori) | solo `security@lelettricaleoni.com` |

**In `public/` va solo ciò che il sito usa**, perché lo scarica chiunque. Banner pubblicitari, biglietti da visita e volantini
usati come materiale grafico stanno in `temp/` (la cartella di scambio, non versionata). Fino al 2026-10-07 il banner
`ADV_LELETTRICA_ULAKE.pdf` stava in `public/pdf/` (dal commit del 2026-04-17), raggiungibile da chiunque conoscesse l'indirizzo,
e portava il telefono e l'indirizzo Gmail. È stato tolto; una copia è in `temp/`. `lib/public-files.test.ts` fa fallire la CI se
in `public/pdf/` finisce un file che nessuna pagina collega. Il file resta nella cronologia di git, che non viene servita.

Il vecchio indirizzo `/assets/pdf/*` (un PDF che Google aveva indicizzato col sito precedente) rimanda a
`/pdf/Volantino 2026.pdf` (`next.config.ts`, `redirects`); `lib/redirects.test.ts` controlla che la destinazione esista.

## Regole

- **L'indirizzo Gmail dell'attività non deve comparire** nel sito. `lib/contact-details.test.ts` lo cerca nel codice, nei
  messaggi e nei file di testo di `public/`; **non** guarda dentro il PDF del volantino (che non lo contiene: se lo si rifà,
  controllalo a mano).
- Il contatto che il sito presenta alle persone è `info@lelettricaleoni.com`; quello per le segnalazioni di sicurezza è
  `security@lelettricaleoni.com`.

## Se un dato cambia

1. Cerca la vecchia stringa in tutto il repository (comando sotto) e cambiala **in ogni punto**, compresi i dati strutturati.
2. Per **telefono** e **orari**: aggiorna anche i PDF, rifacendoli dalla grafica, e Google Business Profile.
3. Per un'**email**: controlla l'alias su Cloudflare (la regola di inoltro) prima di pubblicarla.
4. Per la **partita IVA**: solo `components/footer.tsx`.

```
git grep -n -E "338 123 2434|393381232434|1232434|info@lelettricaleoni|02622600225|Via Roma|09:00"
```

## `security.txt`: da rinnovare ogni anno

`public/.well-known/security.txt` ha una data di scadenza (`Expires`), richiesta dallo standard (RFC 9116), massimo un anno.
Oggi scade il **2027-09-30**. `lib/security-txt.test.ts` **fallisce dopo quella data**, apposta: un `security.txt` scaduto è
peggio di nessuno, perché dice ai ricercatori di non fidarsi. Per rinnovarlo basta spostare `Expires` avanti (non oltre un
anno da oggi) con una pull request.

## Da decidere

- **Una fonte unica.** Il telefono è scritto in dieci punti di sette file, l'indirizzo in nove. Un modulo `lib/business.ts`
  con nome, telefono, email, indirizzo e orari, usato da tutti, farebbe cambiare un dato in un posto solo. Non è fatto.
- **Gli orari nelle descrizioni per i motori** (`layout.tsx:44-46`) dicono «09:00–19:00» senza la pausa delle 13:00–14:00.
- **Il materiale di stampa** (banner, biglietti da visita) porta ancora il telefono e, il banner, l'indirizzo Gmail: se si rifà
  la grafica, usare `info@lelettricaleoni.com`.
