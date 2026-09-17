# Design Spec — Modelli di bici e magazzino ("Il mio negozio")

**Data**: 2026-09-17
**Branch**: `main`
**Stato**: approvato, pronto per il piano di implementazione

---

## Obiettivo

Primo passo, deciso insieme a Kevin, verso un futuro sistema di prenotazioni online con
disponibilità di bici e pagamento Stripe. Questa fase costruisce **solo il lato admin**:
un catalogo di modelli di bici e un inventario delle bici fisiche possedute, entrambi
pensati fin da subito con la struttura giusta per sostenere prenotazioni e prezzi dinamici
in futuro, senza costruire oggi ciò che quel futuro non richiede ancora.

### Dentro questa fase

- Tre liste globali configurabili: taglie, versioni, categorie di bici (con prezzo)
- Catalogo modelli di bici (non bici fisiche): specifiche, foto/video, taglie/versioni
  ammesse, categoria, sovrapprezzo opzionale
- "Il mio negozio": bici fisiche singole, ciascuna con un codice generato automaticamente
- Generalizzazione della tabella media (oggi solo percorsi) per servire anche i modelli di
  bici

### Fuori da questa fase

- Pagina pubblica di vetrina dei modelli (assomiglierà a `/routes`, ma è un passo
  successivo)
- Collegamento bici↔percorsi ("con quali bici si può completare questo giro")
- Prenotazioni, disponibilità, integrazione Stripe
- Accessori non-bici (lucchetti, caschi, seggiolini per bambini) — deciso esplicitamente di
  costruire una struttura specifica per le bici ora, non generica, per non pagare oggi la
  complessità di qualcosa che non esiste ancora
- Stato/manutenzione della singola bici fisica (es. "in riparazione")

---

## Decisioni chiave, e perché

**Una riga per ogni bici fisica, non un conteggio.** Scelto esplicitamente da Kevin invece
di un campo quantità: prepara il terreno per tracciare in futuro manutenzione, stato e
quale bici specifica è prenotata in un dato giorno — cosa che un semplice numero non
permetterebbe mai di fare senza una migrazione.

**Taglie, versioni e categorie sono liste globali, non testo libero sul modello.** Un
modello *sceglie* un sottoinsieme delle taglie/versioni globali che ammette; una bici
fisica sceglie una sola opzione tra quelle ammesse dal suo modello — mai direttamente
dalla lista globale. Questo garantisce che i filtri futuri sulla pagina pubblica ("mostrami
le bici taglia M") si basino su un vocabolario coerente, non su varianti di scrittura
libera.

**Il prezzo appartiene alla categoria, non al modello.** Rispecchia la tabella prezzi già
pubblicata sull'homepage (`components/pricing-section.tsx`): i prezzi oggi variano per
categoria (Gravel, City eBike, eMTB Front, eMTB Full...), non per singolo modello. Un
modello può avere un **sovrapprezzo opzionale** sopra il prezzo della sua categoria — lo
stesso meccanismo che spiega perché "eMTB Full · Alu" e "eMTB Full · Carbon" hanno oggi
prezzi diversi pur essendo la stessa categoria: diventeranno un'unica categoria "eMTB Full"
con il carbonio come sovrapprezzo a livello di modello.

**Due modalità di prezzo per categoria**, scelte da Kevin per rispecchiare la tabella
reale: una "a tabella" (un prezzo esplicito per ciascuno dei giorni 1-7, alcuni possono
restare vuoti) e una "giorno 1 + tariffa fissa" (per le bici classiche, che oggi mostrano
solo "giorno 1: €15, poi €10/giorno"). Entrambe le modalità possono avere in aggiunta un
prezzo pomeriggio/mezza giornata, opzionale e indipendente dalla modalità scelta — presente
oggi per quasi tutte le categorie reali.

**La tabella media dei percorsi si generalizza**, invece di restare separata da quella dei
modelli di bici — scelta esplicita di Kevin contro la mia raccomandazione iniziale (una
tabella nuova e separata sarebbe stata a rischio più basso). Tra le due forme possibili di
generalizzazione, **arco esclusivo** (una colonna di riferimento nullable per ogni tipo di
proprietario, con un vincolo che ne garantisce esattamente una valorizzata) invece
dell'alternativa **polimorfica** (`subject_type` + `subject_id` generico): Kevin ha scelto
esplicitamente di mantenere l'integrità referenziale garantita da Postgres — l'arco
esclusivo permette una vera foreign key con `onDelete: cascade` per ciascun tipo, mentre la
forma polimorfica non può avere foreign key reali e rischierebbe righe orfane silenziose.
Il costo accettato: aggiungere un terzo tipo di proprietario in futuro richiederà una
piccola migrazione (una colonna, un vincolo aggiornato) invece di zero migrazioni.

---

## Modello dati

Convenzioni: stesso stile di `lib/db/schema.ts` esistente — Drizzle, `uuid` con
`defaultRandom()`, `text()` per le stringhe libere, timestamp con `defaultNow()`.

### Le tre liste globali

```
bike_sizes
  id             uuid PK
  name           text not null           -- "S", "M", "L", "XL"
  display_order  integer not null default 0

bike_versions
  id             uuid PK
  name           text not null           -- "Uomo", "Donna", "Unisex", "Bambini"
  display_order  integer not null default 0

bike_categories
  id                 uuid PK
  name               text not null       -- "Gravel", "eMTB Full", "Bici classica"...
  display_order      integer not null default 0
  max_rental_days    integer not null    -- 1-7
  pricing_mode       enum('table', 'linear') not null
  day1_price         numeric not null
  day2_price         numeric              -- solo pricing_mode = 'table'
  day3_price         numeric
  day4_price         numeric
  day5_price         numeric
  day6_price         numeric
  day7_price         numeric
  per_day_after_price numeric             -- solo pricing_mode = 'linear'
  afternoon_price    numeric              -- opzionale, entrambe le modalità
```

Cancellare una riga da una di queste tre tabelle mentre un modello (o una bici fisica) la
referenzia ancora è **rifiutato da Postgres stesso**: le foreign key verso `bike_sizes`,
`bike_versions` e `bike_categories` non hanno `onDelete: cascade` — a differenza di quelle
verso `bike_models`, che invece cascadano quando si cancella il modello stesso. Nessun
controllo applicativo da scrivere: è lo stesso principio dell'arco esclusivo scelto sopra,
applicato di nuovo.

### Catalogo modelli

```
bike_models
  id               uuid PK
  category_id      uuid not null → bike_categories
  price_surcharge  numeric              -- opzionale, sopra il prezzo della categoria
  battery_range    text                 -- specifiche libere, cambiano troppo per un elenco globale
  motor            text
  gear_count       text
  is_published     boolean not null default false
  created_at       timestamp not null default now()
  updated_at       timestamp not null default now()

bike_model_translations       -- stessa forma di route_translations
  id                 uuid PK
  bike_model_id      uuid not null → bike_models (cascade)
  locale             enum('it','en','de') not null
  name               text not null
  description        text not null
  is_auto_translated boolean not null default false

bike_model_sizes              -- quali taglie globali questo modello ammette
  id             uuid PK
  bike_model_id  uuid not null → bike_models (cascade)
  bike_size_id   uuid not null → bike_sizes
  unique(bike_model_id, bike_size_id)

bike_model_versions           -- stessa cosa per le versioni
  id              uuid PK
  bike_model_id   uuid not null → bike_models (cascade)
  bike_version_id uuid not null → bike_versions
  unique(bike_model_id, bike_version_id)
```

Nome e descrizione seguono lo stesso flusso dei percorsi: l'admin scrive solo in italiano,
`translateFromItalian` (Azure Translator) genera EN/DE. Stesso meccanismo di
`needsRetranslation` per decidere quando rigenerare.

### "Il mio negozio" — bici fisiche

```
bike_units
  id              uuid PK
  bike_model_id   uuid not null → bike_models     -- niente cascade: un modello con bici
                                                   -- fisiche esistenti non si può cancellare
  bike_size_id    uuid not null → bike_sizes      -- deve essere tra quelle ammesse dal modello
  bike_version_id uuid not null → bike_versions   -- stessa condizione
  created_at      timestamp not null default now()
```

Il codice mostrato in interfaccia è `shortRouteId`-style: i primi 8 caratteri esadecimali
dell'`id`, stessa funzione già esistente in `lib/utils.ts`, riusata senza modifiche.

Che `bike_size_id`/`bike_version_id` siano davvero tra quelli ammessi dal modello scelto è
un vincolo application-level (verificato nella server action), non un constraint SQL —
esprimerlo in SQL richiederebbe una funzione o trigger sproporzionati per il beneficio,
mentre la Server Action che crea la riga ha già in mano sia il modello sia le sue taglie
ammesse nello stesso momento.

### Media generalizzata (era `route_photos`)

```
media
  id             uuid PK
  route_id       uuid → routes (cascade)        -- nullable
  bike_model_id  uuid → bike_models (cascade)    -- nullable
  storage_key    text not null
  media_type     enum('photo','video') not null default 'photo'
  display_order  integer not null default 0
  alt_text       text
  created_at     timestamp not null default now()

  check (num_nonnulls(route_id, bike_model_id) = 1)
```

Una migrazione rinomina `route_photos` in `media`, aggiunge `bike_model_id` (nullable) e il
vincolo CHECK, e imposta `bike_model_id = null` su ogni riga esistente (già vero di
default). Nessun dato esistente si sposta o si perde.

**File esistenti da aggiornare** per il nuovo nome/forma (elenco esatto, da
`grep -rl routePhotos`):
`lib/actions/routes.ts`, `app/[lang]/routes/[id]/page.tsx`, `lib/flags.ts`,
`lib/routes-data.ts`, `lib/dev-stats.ts`, `lib/db/schema.ts`,
`components/route-card-media-async.tsx`, `lib/flags.test.ts`. Il piano di implementazione
deve includere una verifica che la sezione percorsi funzioni ancora identica dopo la
migrazione — è un sistema che oggi funziona, e questa è l'unica parte di questa fase che lo
tocca.

---

## Pagine admin

Stesso pattern dei percorsi: Server Action in `lib/actions/`, mai route handler (vedi la
skill `nextjs-16`), stesso controllo `getAdminUser()` di tutto il resto del pannello,
nessun permesso granulare separato.

- **`/manage/bike-options`** — le tre liste globali a schede (taglie / versioni /
  categorie con prezzi)
- **`/manage/bikes`** — catalogo modelli: lista con pubblica/nascondi (come i percorsi),
  form di creazione/modifica con nome+descrizione IT, categoria, sovrapprezzo, specifiche,
  taglie/versioni ammesse, upload foto/video (stesso componente di upload dei percorsi,
  puntato alla tabella `media` generalizzata)
- **`/manage/bikes/shop`** — "Il mio negozio": elenco delle bici fisiche raggruppabile per
  modello, form per aggiungerne una nuova (scegli modello pubblicato → scegli taglia/
  versione tra quelle ammesse → conferma, il codice si genera da solo)

Un modello senza nessuna taglia o versione ammessa è valido a livello di database, ma
l'interfaccia di "Il mio negozio" lo segnala prima di permettere di aggiungere una bici
fisica di quel modello — altrimenti non ci sarebbe nulla tra cui scegliere.

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| La generalizzazione della tabella media rompe qualcosa nei percorsi | 8 file da aggiornare, tutti elencati sopra; il piano di implementazione include verifica esplicita che percorsi/foto/video pubblici e admin funzionino identici dopo la migrazione |
| Un modello senza taglie/versioni ammesse blocca silenziosamente "Il mio negozio" | Segnalato in interfaccia al momento giusto, non solo scoperto quando si prova ad aggiungere una bici |
| Le categorie non sono ancora collegate alla tabella prezzi reale dell'homepage | Fuori scope per questa fase — la tabella prezzi resta statica finché non si deciderà di renderla dinamica leggendo da `bike_categories`, una fase separata |
