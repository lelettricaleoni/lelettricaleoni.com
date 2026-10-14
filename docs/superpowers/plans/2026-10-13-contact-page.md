# Pagina dei contatti: un posto solo per telefono, email, indirizzo e orari

> **Da pianificare, non iniziato** (Kevin, 2026-10-13: «vorrei avere una pagina dedicata alle informazioni di contatto in modo da poterla linkare in giro
> per il sito, invece di dover scrivere da per tutto le informazioni di contatto»). Questo file è il piano: `[ ]` da fare, `[~]` in corso, `[x]` fatto.
> Va rivisto con Kevin (domande in fondo) **prima** di scrivere codice. Lavoro su `staging`, una PR, mai produzione.
> Next.js: quando si scrive il codice, leggere prima `node_modules/next/dist/docs/` per ciò che si usa (pagina con `generateMetadata`, `sitemap`, `'use cache'`
> + `updateTag` per gli orari) e scrivere nella PR quale pagina è stata letta.

## Il problema (misurato, da `docs/contact-details.md`)
Telefono, email, indirizzo e orari sono scritti a mano in una decina di file e nelle tre lingue: footer, hero, sezione mappa, pagina «non trovata», pulsanti di contatto delle bici,
pagine di servizio, nota «con fattura» del noleggio, termini, informativa, dati strutturati. Un cambio va fatto in ogni punto (e `docs/contact-details.md` esiste per ricordarlo).
Gli **orari** hanno due copie che già divergono: la tabella `shop_opening_hours` (pannello `/manage/hours`, usata dalla prenotazione) e il testo scritto a mano nelle pagine.

## Obiettivo
1. Una **pagina** `/{lang}/contact` con tutti i recapiti, che il resto del sito **linka** invece di ripeterli.
2. Un **dato solo** per i recapiti nel codice (`lib/contact.ts`) e gli **orari letti dalla tabella**, così la pagina, la home e i dati strutturati dicono lo stesso.
3. Un test che impedisce di riscrivere a mano un recapito in un altro posto.

## Cosa NON cambia
- Informativa privacy e termini: il titolare e `privacy@` restano scritti nel testo legale (un testo legale non si sposta in una pagina che può cambiare); la loro email/telefono si controllano con il test, non si linkano.
- Google Business Profile resta a mano (ha la sua copia: va aggiornata insieme al sito).
- I PDF del volantino (telefono scritto nella grafica).

## Compiti

### T1 — Decisioni con Kevin (prima di tutto)
- [ ] Rispondere alle domande in fondo.

### T2 — Un dato solo: `lib/contact.ts`
- [ ] Costanti: telefono (per il link `tel:` e per la vista), email visibile (`info@`), email aiuto (`help@`, solo se la pagina di aiuto nasce), indirizzo in campi (via, CAP, città, provincia, paese), coordinate, link indicazioni stradali, profili social, P.IVA.
- [ ] Test: i valori hanno il formato giusto (telefono con `libphonenumber-js`, email con `z.email()`); nessun indirizzo Gmail (la regola esistente di `lib/contact-details.test.ts`).
- [ ] I dati strutturati (`app/[lang]/layout.tsx`) e il footer leggono da qui.

### T3 — Gli orari dalla tabella (chiude il punto aperto «orari scritti a mano»)
- [ ] `loadShopSchedule()` (già usato dalla prenotazione) dietro `'use cache'` con tag `shop-hours`; le azioni di `/manage/hours` fanno `updateTag('shop-hours')`.
- [ ] Una funzione che formatta gli orari della settimana per la pagina («tutti i giorni 09:00–13:00 e 14:00–19:00», oppure giorno per giorno se differiscono) e le chiusure prossime.
- [ ] Home (`info.hours_value`), sezione mappa, dati strutturati (`openingHoursSpecification`) e descrizioni per i motori leggono lo stesso dato.
- [ ] **Misurare prima e dopo** (CLAUDE.md: una modifica sul percorso di ogni richiesta, la home): tempi della home con e senza lettura degli orari, cache a freddo e a caldo.

### T4 — La pagina `app/[lang]/contact/page.tsx`
- [ ] Contenuto (it/en/de in `messages/*.json`, sezione `contact`): titolo, telefono (link `tel:`), email (link `mailto:`), indirizzo con «Indicazioni» (link a Maps) e **mappa caricata solo dopo il clic** (come `map-embed.tsx`: nessun dato a Google prima del consenso), orari (T3), chiusure prossime, social. **Poco testo** (regola di Kevin del 2026-10-13).
- [ ] Un `generateMetadata` (titolo e descrizione), `ContactPage` nei dati strutturati, voce nella sitemap, `hreflang` come le altre pagine.
- [ ] Nessun modulo di contatto (nessun dato nuovo da raccogliere: niente privacy da aggiungere). Se Kevin lo vuole, è un lavoro a parte con informativa.
- [ ] Design: dalle skill `design-system` e `frontend-design`; schede `rounded-xl`, un solo pulsante pieno (Chiama), azioni rettangolari; provato a 320, 375, 1440.

### T5 — Linkare invece di ripetere
- [ ] Footer: recapiti ridotti a un link «Contatti» (e P.IVA/ragione sociale restano, sono dati legali).
- [ ] Hero e sezione mappa della home: il pulsante «Chiama» resta (azione), il resto rimanda alla pagina.
- [ ] Pagina «non trovata», pulsanti di contatto delle bici, pagine di servizio, nota «con fattura» del checkout: testo corto + link alla pagina.
- [ ] Navbar «Contatti»: oggi porta alla sezione della home; decisione di Kevin (domanda 3).
- [ ] Termini (`seller_body`, `invoice_body`): decisione con chi rivede i testi legali; per ora restano come sono e passano dal test.

### T6 — Guardie e documenti
- [ ] `lib/contact-details.test.ts` esteso: telefono, `info@` e indirizzo compaiono **solo** in `lib/contact.ts`, `messages/*.json` della pagina contatti, informativa e termini (elenco chiuso); in ogni altro file il test fallisce.
- [ ] Riscrivere `docs/contact-details.md`: la tabella «dove è scritto» si riduce a «`lib/contact.ts` + tabella orari», restano «fuori dal codice» (alias Cloudflare, Business Profile) e i PDF.
- [ ] Aggiornare `STATE.md` (una riga) e togliere il punto «Orari scritti a mano» da `prenotazioni-punti-aperti.md`.

### T7 — Verifica
- [ ] `tsc`, `eslint`, `vitest`; browser a 320/375/1440 in it/en/de, senza scorrimento orizzontale, schermate guardate.
- [ ] Cambiare un orario da `/manage/hours` e vedere la home, la pagina e i dati strutturati cambiare **senza** un deploy.
- [ ] Confronto con la versione precedente: titoli, link, dati strutturati (`curl` del JSON-LD prima e dopo), niente recapito sparito.

## Privacy e cookie (le cinque domande, risposte in anticipo)
1. Dati nuovi: nessuno (recapiti dell'attività, non di persone). 2. Servizi esterni: solo la mappa, già dietro clic. 3. Cookie/storage: nessuno. 4. Informativa: invariata.
5. Prima del consenso: nessuna richiesta a terzi.

## Domande per Kevin
1. **Cosa deve contenere la pagina?** Telefono, email `info@`, indirizzo con mappa e indicazioni, orari, Instagram: altro (WhatsApp, Facebook, indicazioni su dove parcheggiare, come arrivare in bici)? Va mostrato `help@`?
2. **WhatsApp**: il numero è anche WhatsApp? Se sì, un pulsante «Scrivici su WhatsApp» (link `wa.me`) sarebbe un'azione in più.
3. **La voce «Contatti» della navbar** deve portare alla nuova pagina o restare l'ancora della home?
4. **Orari dalla tabella**: confermi che home, mappa e dati strutturati leggano la tabella (richiede la misura dei tempi della home)?
5. **Un modulo di contatto** (nome, messaggio) o solo recapiti? Il modulo richiede informativa e una casella dove arrivare.
6. **Nome della pagina nell'indirizzo**: `/it/contact` (codice in inglese, come `/terms`, `/privacy`) o `/it/contatti`? Proposta: `/{lang}/contact`, come le altre pagine.
