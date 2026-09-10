# Design Spec — Test contro il deploy di preview

**Data**: 2026-09-10
**Stato**: approvato, non implementato
**Rapporto con** `2026-09-09-test-suite-design.md`: ne sostituisce gli strati 2 e 3.
Lo strato 1 di quella spec — la rete di sicurezza sulla logica pura — è **implementato**:
70 test in CI.

---

## Perché questa spec esiste

La spec di settembre prevedeva finti servizi (`USE_FAKE_SERVICES`) per poter eseguire
end-to-end in CI senza Supabase né R2. Nel frattempo è emersa una strada che non richiede
di costruirli: **Vercel offre un token di bypass per l'automazione**
(`VERCEL_AUTOMATION_BYPASS_SECRET`), pensato esattamente per far girare i test contro un
deploy protetto. Il preview di ogni PR è già un ambiente vero, con i servizi veri.

Mantenere un finto costa più di quanto renda, se esiste un vero a disposizione.

## Cosa ha dimostrato di servire, il 2026-09-10

Tre guasti veri, tutti arrivati in produzione, tutti banali da cogliere con la misura
giusta:

**Le statistiche tagliate.** Le card con cinque tag avevano una colonna interna da 397px
dentro una card da 315: tre celle su quattro visibili. La pagina rispondeva 200. Il primo
tentativo di correzione sembrava aver funzionato perché le card con pochi tag stavano bene.

**Il pannello a 49 secondi.** `/manage/routes` ha impiegato fra 18 e 49 secondi per ore
senza che nulla lo segnalasse. Prima, a giugno, la home era passata da 0,15 a 6,2 secondi
allo stesso modo.

**Le immagini.** Una foto sorgente da 976 KB genera quattro varianti, e ogni variante è una
decodifica più una ricodifica: CPU pura sul piano Vercel, dove la quota è di 4 ore al mese.

---

## Livello 1 — Logica pura *(esiste)*

70 test vitest in CI, senza servizi. Coprono ciò che si può sbagliare calcolando: la
percentuale che torna indietro, il TTL di uno stato, il parsing di un valore che ha
attraversato il confine fra due repository, l'allineamento delle chiavi dei dizionari.

Restano come sono. Sono veloci, non sono ballerini, e girano su ogni PR.

## Livello 2 — Contenuto e geometria

**Dove**: Playwright contro l'URL di preview della PR, con
`x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET`.

### Il contenuto c'è

Mai lo stato HTTP: **qui una sezione spenta risponde 200**, per via dello streaming più
`notFound()`. Si guarda cosa c'è dentro.

| Pagina | Asserzione |
|---|---|
| `/it/routes` | almeno una card, con titolo e quattro celle di statistiche |
| `/it/routes/[id]` | titolo, statistiche, e la galleria se il percorso ha media |
| `/it` | le sezioni servizi, prezzi, contatti |
| `/it/privacy` | il testo, non un guscio |
| una lingua diversa | `/de/routes` rende in tedesco, non in italiano |

Le asserzioni sono sui **minimi** — «almeno una card» — perché i dati sono quelli veri e
cambiano quando Kevin pubblica un percorso.

### Niente sborda

Una sola asserzione, generica, applicata a ogni pagina:

> nessun elemento supera il bordo del proprio contenitore

Ripetuta a **tre larghezze**: 390 (telefono), 900 (due colonne), 1440 (tre colonne). La
larghezza è parte del test, non un dettaglio: il guasto di oggi era invisibile a una
colonna e visibile a tre.

## Livello 3 — Budget

Sullo stesso preview, tre misure con un tetto ciascuna.

| Misura | Perché | Tetto iniziale |
|---|---|---|
| **TTFB** per pagina | è il tempo in cui la funzione *calcola*, cioè la CPU che Vercel conta | da fissare misurando, con margine |
| **Peso trasferito** | dove si vedono le immagini non ottimizzate | idem |
| **Numero di richieste** | prende gli N+1 e le varianti immagine di troppo | idem |

I tetti si fissano **misurando la produzione sana e aggiungendo margine**, non a
sentimento: un tetto inventato o blocca tutto o non blocca niente.

Lighthouse (dal plugin Chrome DevTools) resta a comando per i Core Web Vitals, non in CI:
è lento e il suo punteggio oscilla abbastanza da rendere ballerino un cancello.

---

## Come gira

1. La PR viene aperta; Vercel costruisce il preview.
2. Un job attende il deploy e ne recupera l'URL.
3. Playwright esegue i livelli 2 e 3 contro quell'URL, col token di bypass.
4. Il fallimento blocca il merge, come già fa `verify`.

I livelli 2 e 3 **non girano in locale per obbligo**: accettano un URL base, quindi si
possono puntare a `localhost:3000` o alla produzione quando serve indagare.

## Cosa serve da Kevin

- Generare il token in **Deployment Protection → Protection Bypass for Automation**
- Metterlo nei secret del repository come `VERCEL_AUTOMATION_BYPASS_SECRET`

## Buchi dichiarati

- **Il flyover 3D** resta fuori: WebGL headless più un token Cesium Ion è lento e ballerino,
  e verrebbe disattivato al primo fallimento casuale.
- **Nessun confronto di immagini pixel per pixel**: su pagine piene di foto e mappe vere
  fallisce per motivi che non sono difetti, e fa la fine del flyover.
- **Il pannello admin** non è coperto ai livelli 2 e 3 finché non c'è un modo di
  autenticarsi nei test che non significhi mettere credenziali in CI.
- **Gli end-to-end vedono i dati veri**, quindi non possono asserire quantità esatte.

## Fasi

1. **Geometria** — l'asserzione che niente sborda, a tre larghezze. È quella che oggi ci
   avrebbe salvati due volte, e non dipende dai dati.
2. **Contenuto** — le asserzioni per pagina.
3. **Budget** — dopo aver misurato la produzione sana per fissare i tetti.

## Rischi

| Rischio | Mitigazione |
|---|---|
| I test dipendono dai dati veri, che cambiano | Asserzioni sui minimi, mai su quantità esatte |
| Il preview è lento a costruirsi | Il job attende il deploy invece di indovinare un ritardo |
| I budget diventano rumore | Tetti ricavati misurando, con margine; si rivedono quando il sito cambia |
| Il token di bypass finisce esposto | Vive solo nei secret del repository, mai nel codice |
