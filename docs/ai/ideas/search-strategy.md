# Strategia: farsi trovare, e sapere se funziona

> Scritta il 2026-09-25, sopra l'inventario in `search-console-analytics.md` (che ha i numeri e i
> problemi). Qui c'è il **cosa fare, in che ordine, e come si capisce se ha funzionato**.
> I numeri sono piccoli (qualche centinaio di clic al trimestre): niente obiettivi finti al
> decimale, e ogni decisione va guardata su almeno un mese.

## 1. A cosa serve il sito

Il sito non vende online: il suo lavoro è **far arrivare un contatto** a un negozio di noleggio a
Dro. Il contatto vero, misurabile, è una di queste azioni: `phone_call`, `email_click`,
`get_directions` (e, a stagione, il download del listino o del GPX come segnale di interesse).
Tutto il resto (visite, sezioni viste) è un mezzo. Oggi si contano 22 telefonate da 19 utenti in
30 giorni: quello è il numero da far crescere.

Due pubblici, con esigenze diverse:
- **Chi ci conosce già** (cerca "lelettrica dro", "l'elettrica dro"): va servito bene, ma è già
  servito: posizione 1.
- **Chi non ci conosce**, soprattutto turisti (italiani, tedeschi, olandesi, polacchi): cerca
  "noleggio e-bike Arco", "bike rental Riva del Garda", "Fahrradverleih Gardasee". Qui oggi
  compariamo con una sola impressione a testa: **è dove sta la crescita**.

## 2. Punto di partenza (per confrontare fra un mese e fra tre)

| | Valore al 2026-09-25 |
|---|---|
| Search Console, 90 giorni | 483 clic · 3.211 impressioni · CTR 15% · posizione 5,3 |
| Clic spiegati dalle query visibili | circa 130 su 483: il resto sono ricerche rare che Google nasconde |
| di cui col nome (brand) | circa 60 ("l'elettrica dro", "lelettrica dro", "lelettrica") |
| di cui senza il nome (non-brand) | circa 70, in gran parte "noleggio bici dro" (38) e "negozio bici dro" (7) |
| Mobile in Italia | 353 clic su 418; posizione 3,9 (desktop: 9,3) |
| Analytics, 30 giorni | 239 sessioni · 139 utenti · 151 da ricerca organica |
| Contatti, 30 giorni | 22 `phone_call` (19 utenti) · 4 `get_directions` · 7 `form_submit` |
| Eventi chiave configurati | nessuno visibile |

Nota sul metodo: Analytics conta solo chi accetta i cookie, quindi **sottostima**. Per la ricerca
la fonte di verità è Search Console; Analytics serve per capire cosa fa la gente dopo.

## 3. Fasi

### Fase 0 — Misurare bene (settimana 1)
Senza questo, il resto è a sentimento.
- **Kevin, in Analytics:** registrare le dimensioni personalizzate degli eventi (`source`,
  `section_name`, `route_id`, `difficulty`, `bike_model_id`, `category`, `filter_type`,
  `filter_value`, `language`, `cta_name`, `link_domain`, `method`, `preview_mode`, `route`) e
  segnare come **evento chiave** `phone_call`, `email_click`, `get_directions`, `download_gpx`,
  `file_download`. Poi cancellare la proprietà `Test-lelettricaleoni.com`.
- **Io:** una dashboard nel pannello admin (`/manage/analytics`) con i sei numeri della sezione 4,
  per periodo, da Analytics e Search Console. **Richiede le credenziali di Google su Vercel**
  (decisione di Kevin: vedi sezione 6).
- **Google Business Profile** (la scheda su Maps): è il canale locale più importante e non è nei
  nostri strumenti. Kevin: controllare che sia rivendicata, con orari, foto, categoria "noleggio
  biciclette", e che il link al sito abbia `?utm_source=google&utm_medium=organic&utm_campaign=gbp`
  per vedere in Analytics quanti contatti arrivano da lì. La differenza di posizione tra mobile
  (3,9) e desktop (9,3) suggerisce che il grosso arriva dalle ricerche locali.

### Fase 1 — Sistemare le basi (settimane 1-3, tutto codice mio)
1. **Radice `/`:** da 301 a **307**, e l'apex (`lelettricaleoni.com`) direttamente a
   `www…/it` in un salto solo. Oggi sono due salti e un permanente che dipende dalla lingua.
   Tocca la pagina che porta più traffico: si fa con misura prima e dopo, e si guarda Search
   Console per due settimane.
2. **`staging`:** `X-Robots-Tag: noindex` sull'host di staging (oltre alla protezione di Vercel).
3. **Titoli e descrizioni delle pagine interne:** oggi "Percorsi consigliati | Lelettrica" e "Le
   nostre bici | Lelettrica" non dicono cosa sono né dove. Con le parole che la gente cerca:
   "Percorsi in e-bike attorno a Dro e al Lago di Garda", "Bici a noleggio a Dro: e-bike, MTB,
   gravel". Idem i dettagli dei percorsi (`/it/routes/bdd7a446` ha 294 impressioni e solo 2,7% di
   CTR) e delle bici, e le tre lingue.
4. **H1 della home:** oggi è solo "Lelettrica". Un H1 che dica cosa siamo e dove ("Noleggio e-bike
   e riparazioni a Dro, Lago di Garda") aiuta chi non ci conosce, senza toccare l'aspetto.
5. **Dati strutturati:** il catalogo dentro `app/[lang]/layout.tsx` è scritto a mano, elenca
   modelli che possono non essere più quelli veri e usa il tipo `RentalCar` per delle bici (non è
   il tipo giusto). Si rifà dal database, con `Product`, come già fanno le pagine delle bici. La
   parte del negozio (indirizzo, coordinate, orari, telefono) è già buona e resta.

### Fase 2 — Farsi trovare da chi non ci conosce (mesi 1-3)
Il collo di bottiglia non è la tecnica, è che **manca una pagina che risponda** alle ricerche
senza il nome.
- **Pagine per le ricerche che oggi non ci trovano:** noleggio e-bike, noleggio eMTB, noleggio
  gravel, riparazione e-bike, in italiano, tedesco e inglese, ciascuna con prezzi, modelli e un
  contatto. Le pagine delle 7 bici sono già un inizio; si collegano dalle pagine di servizio e
  viceversa.
- **I percorsi come richiamo:** hanno traccia GPX, mappa e video, e sono la cosa che le altre
  attività non hanno. Ogni percorso deve avere titolo e testo che parlino di *chi lo cerca* ("giro
  in e-bike da Dro a…"), e un invito chiaro a noleggiare la bici adatta (la card "bici adatte a
  questo giro" già esiste).
- **Tedesco:** 27 clic dalla Germania in 90 giorni, con ricerche come "Fahrrad verleih in der
  Nähe" e "Mountainbike ausleihen", più Paesi Bassi, Austria e Svizzera. Il turismo di lingua
  tedesca è una fetta reale: la versione `/de` va tenuta al livello dell'italiana, non tradotta a
  metà.
- **Recensioni su Google:** contano per la ricerca locale più di qualsiasi ritocco al sito. Un modo
  semplice di chiederle (un cartello con codice QR al banco) è un'azione di Kevin, non di codice.

### Fase 3 — Guardare e correggere (ogni mese, da ottobre)
Un appuntamento fisso, dieci minuti, sulla dashboard: vedi sezione 4. Regole per decidere:
- Una ricerca con **più di 50 impressioni e CTR sotto il 3%** → si riscrive titolo e descrizione
  di quella pagina.
- Una pagina con **impressioni ma nessun contatto** → manca un invito, o il contatto è nascosto.
- Una ricerca senza nostra pagina, che si ripete → si scrive la pagina (Fase 2).
- Un calo di posizione dopo una modifica → si torna indietro e si aspetta due settimane.

## 4. I sei numeri da guardare

1. **Contatti** (`phone_call` + `email_click` + `get_directions`) — è l'obiettivo.
2. **Clic non-brand** da Search Console — misura se cresciamo fra chi non ci conosce.
3. **Impressioni non-brand** — anticipa il punto sopra.
4. **CTR e posizione** delle pagine con più impressioni.
5. **Sessioni da ricerca organica** e da assistenti AI (5 in 30 giorni: pochi, ma è un canale
   nuovo e non costa niente tenerlo d'occhio).
6. **Contatti per fonte** (`source`: hero, contatti, footer, dettaglio bici) — dice dove mettere
   l'invito a chiamare.

## 5. Cosa ci aspettiamo (e cosa no)

- **Fase 1** dà effetti piccoli e certi: click su pagine già viste, meno dispersione, dati puliti.
- **Fase 2** è dove sta la crescita, ma lenta: le pagine nuove impiegano settimane a comparire.
  Un mese senza effetto non vuol dire che non funziona.
- **Non promettiamo numeri.** Con questi volumi, ± 20% da un mese all'altro è rumore, e la
  stagione (estate contro inverno) pesa più di qualsiasi ottimizzazione. Il confronto onesto è
  **stesso mese, anno su anno**, e il primo anno serve a costruire la misura.

## 6. Decisioni che servono a Kevin

1. **Credenziali di Google su Vercel** per la dashboard nel pannello: un service account con
   accesso in sola lettura ad Analytics e Search Console. Rischio: il file di chiave sta su un
   servizio in più. Alternativa senza credenziali su Vercel: la dashboard resta un report che
   genero io a richiesta con gli strumenti che ho, senza pagina nel sito.
2. **Google Business Profile:** chi lo gestisce, e se è rivendicata la scheda.
3. **Il via per la Fase 1**, in particolare il cambio della radice (il passo con più rischio).
4. **Le pagine di servizio** (Fase 2): vanno bene i testi in prima bozza scritti da me, da rivedere
   da lui (i prezzi e le condizioni sono suoi)?
