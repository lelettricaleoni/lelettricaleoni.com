---
name: cookie-consent
description: "Use when a change adds, moves or removes anything that sets a cookie or stores something in the browser, loads a script or a resource from another host, sends an analytics event, or touches the cookie banner (components/cookie-consent.tsx), Google Analytics / Consent Mode (app/[lang]/layout.tsx, lib/analytics.ts), or the session cookies of the accounts. Also to CHECK, with a real browser, what the site does before and after a visitor chooses. Companion of privacy-cookies (which holds the policy and the inventory); this one holds the banner, the consent mechanics and how to verify them."
---

# Cookie e consenso in questo progetto

**Regola madre (Kevin, 2026-10-07: «devi andarci preventivo con la privacy… e anche sui cookie»):** si decide *prima* di scrivere il codice che
cosa si memorizza nel browser e verso chi parte una richiesta, e il banner e l'informativa si aggiornano nella **stessa PR**. Non è un lavoro da fare
dopo. Per l'informativa e l'inventario vedi `privacy-cookies`; qui c'è il meccanismo.

**Non è consulenza legale**: sono fatti del codice e procedure di verifica. Le questioni giuridiche aperte stanno in `privacy-cookies`.

## Come funziona oggi

- **Banner**: `vanilla-cookieconsent` 3 in `components/cookie-consent.tsx`. I testi stanno **nel componente**, tre blocchi (it, en, de) da tenere uguali.
  Categorie: `necessary` (sempre, non disattivabile) e `analytics`. Il cookie del banner è `cc_cookie` (182 giorni).
- **Analytics**: GA4 con **Consent Mode v2**. Lo script `ga4-consent-init` (`app/[lang]/layout.tsx`) mette tutto in `denied` e dà 500 ms al banner per rispondere;
  `onConsent` e `onChange` mandano `gtag('consent','update', …)`. Si carica solo in produzione (`isProduction()`): in locale, in staging e nelle anteprime
  non c'è Analytics, e non lo si prova lì.
- **Cookie sempre presenti** (tabella del banner): `cc_cookie`. **Solo se la persona accede**: `sb-*-auth-token` e `sb-*-auth-token-code-verifier`
  (sessione di Supabase, fino a 400 giorni). **Solo con il consenso**: `_ga`, `_ga_<id>`.
- **Eventi**: `trackEvent` (`lib/analytics.ts`) manda solo categorie (`source`, `mode`, `language`, id di percorso o di bici): **mai** email, telefono, nomi,
  id dell'account. Lo verifica la lettura del codice, non un test: ricontrollare a ogni evento nuovo.
- **Le guardie in CI** (`lib/privacy-surface.test.ts`): falliscono quando il codice cita un **host** su cui nessuno ha deciso, quando un file nuovo usa **cookie o
  storage del browser** senza essere in elenco, o quando l'informativa smette di nominare un servizio che il codice usa. Se scattano non si aggiunge la riga e basta:
  si decide cosa significa per banner e informativa, si scrive, e poi si aggiunge la riga con il motivo.

## Aggiungere qualcosa: in ordine

1. **È un cookie, `localStorage` o `sessionStorage`?** Serve per il servizio che la persona ha chiesto (sessione, lingua scelta, carrello)? → `necessary`. Serve a noi per misurare,
   a ricordare dove ha cliccato, a profilare? → `analytics` (o una categoria nuova), **spento finché non c'è il consenso**.
2. **Aggiungilo alla tabella del banner nelle tre lingue** (nome, dominio, a cosa serve, durata). Il dominio di un cookie senza attributo è l'host: `www.lelettricaleoni.com`.
3. **Aggiungi il file a `MAY_STORE_IN_THE_BROWSER`** in `lib/privacy-surface.test.ts`, con una riga che dice cosa conserva.
4. **Un servizio esterno nuovo** (script, immagini, font, mappe, API chiamata dal browser): riceve l'indirizzo IP. Va nominato nell'informativa (`messages/*.json`,
   `privacy`) e nella tabella `DECLARED_IN_THE_POLICY` del test; se non è dato personale, in `NOT_PERSONAL_DATA` con il motivo.
5. **Un evento nuovo**: solo categorie. Poi guardarlo davvero (sotto).
6. **Cambia la data** (`privacy.last_updated`) e, se cambia ciò che si dice, la skill `privacy-cookies`.

## Verificare con un browser vero

Non basta leggere il codice: l'errore tipico (una richiesta a Google prima del consenso) si vede solo a runtime. Con il browser di Playwright, **da un profilo pulito**:

1. **Azzerare**: il profilo del browser di prova **ricorda** il consenso e i cookie di visite passate (sul sito vero aveva `cc_cookie`, `_ga`). Cancellare i cookie
   dell'host prima di guardare, altrimenti si misura un visitatore che ha già scelto.
2. **Prima di qualunque scelta** (pagina appena aperta, banner visibile): elencare i cookie (`document.cookie`) e gli host esterni
   (`performance.getEntriesByType('resource')`, host diversi dal proprio). **Atteso: nessun cookie, nessuna richiesta a servizi di terzi non dichiarati.**
3. **«Solo necessari»**: ricaricare e rifare l'elenco. Atteso: `cc_cookie` e basta; niente `_ga`.
4. **«Accetta tutto»**: atteso `_ga` e `_ga_<id>`.
5. **Revoca** da «Impostazioni cookie» (footer): i cookie di Analytics vanno cancellati.
6. **Dopo l'accesso**: compaiono i cookie `sb-*`, e sono quelli della tabella.

### Misura del 2026-10-07 sul sito vero (profilo azzerato, nessuna scelta)

- **Cookie: nessuno**; banner visibile. ✅
- **Richieste a terzi: una**, `www.googletagmanager.com` (lo script `gtag.js`), caricato `afterInteractive` per **tutti**, anche prima del consenso. Con Consent Mode in
  `denied` non imposta cookie, ma **Google riceve l'indirizzo IP** del visitatore. È la domanda 8 di `privacy-cookies`. **Scelta più prudente, da decidere con Kevin**:
  caricare `gtag.js` solo dopo il consenso (`onConsent`/`onChange`), tenendo `dataLayer` e `gtag` come coda che non contatta nessuno. Costo: niente più
  «ping senza cookie» da chi rifiuta, cioè qualche dato in meno (il traffico è già poco: 32 sessioni in una settimana). Non è ancora fatto.

## Trappole

- **`window.gtag` risulta `undefined` nel browser di Playwright** anche se Analytics funziona per le persone vere: gli eventi (`section_view`, `route_view`, `bike_view`)
  arrivano nella proprietà di produzione. **Non concluderne che Analytics sia rotto**: controllare i dati con `run_report` (proprietà `328727214` = sito, `534446246` = prova),
  per nome evento.
- **Il consenso si ricorda per 182 giorni** (`cc_cookie`): una prova «da nuovo visitatore» senza azzerare misura il visitatore sbagliato.
- **In locale Analytics non c'è** (`isProduction()`): per vedere cosa carica serve guardare il sito vero, in sola lettura, senza dare il consenso (una visita con
  «Accetta tutto» sporca la proprietà di produzione).
- **Gli eventi chiamati prima del consenso** finiscono in `dataLayer`, non nella rete, finché `gtag.js` non c'è: con il caricamento dopo il consenso partirebbero
  tutti insieme appena la persona accetta.
- **Un cookie senza il suo posto nel banner** è un'informativa falsa: il test lo ferma per i file, ma non può sapere cosa scrive un servizio esterno (Google, Cesium, Esri):
  per quelli vale la lettura della rete.

## Cosa NON si fa

- Niente cookie «tecnici» che in realtà misurano o profilano.
- Niente dati personali in `trackEvent`, né nell'indirizzo (`?email=`), né nei log (vedi `privacy-cookies`: l'errore di una query di Drizzle contiene i parametri).
- Niente CDN esterni «per comodità»: ogni host in più è un destinatario in più da dichiarare.
- Niente skill di terzi scaricate senza leggerle: le istruzioni di una skill sono codice che guida l'agente. Le idee di quelle trovate in rete (verifica a runtime dei
  tracker prima del consenso, dati personali nell'indirizzo, cookie non documentati) sono qui, scritte per questo progetto.
