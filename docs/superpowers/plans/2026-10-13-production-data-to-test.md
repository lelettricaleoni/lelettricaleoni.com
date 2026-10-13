# Portare i dati di produzione sul test, per provare prima di pubblicare

> **Da pianificare, non iniziato** (Kevin, 2026-10-13: «vorrei portare i dati dell'ambiente di produzione su test, in modo tale da poter fare una prova accurata
> prima di pubblicare»). Questo file è il piano: `[ ]` da fare, `[~]` in corso, `[x]` fatto. **Nulla si scrive sul database di sviluppo prima della conferma di Kevin
> sulle scelte in fondo** (il copia **sovrascrive** i dati di sviluppo). In produzione si **legge soltanto**.

## Cosa c'è (misurato il 2026-10-13, solo conteggi, in sola lettura)
| | Produzione | Sviluppo (= test, staging, anteprime, CI) |
|---|---|---|
| Migrazioni nel tracking | 17 (`0000`–`0016`) | fino a `0025` (le `0017`–`0025` mancano in produzione) |
| Categorie bici / modelli / traduzioni | 7 / 10 / 30 | prove di Kevin e di Claude |
| Taglie, versioni, collegamenti modello | 6 + 4, 41 + 12 | idem |
| Bici fisiche (`bike_units`) | 23 | idem |
| Foto e video (`media`) | 70 | idem |
| Percorsi / traduzioni / categorie percorso | 12 / 36 / 6 | idem |
| **Clienti / prenotazioni / utenti di accesso** | **3 / 4 / 4** | di prova |
| `integrations` (calendario Google) | 1 | una sua |

Sviluppo, staging, anteprime e il controllo `browser` della CI usano **lo stesso** progetto Supabase di sviluppo: «il test» è quello.
Produzione non ha una connessione diretta dal PC (`STATE.md`): si legge con l'MCP `supabase` (`execute_sql`), niente `pg_dump`.

## Tre fatti che cambiano il piano
1. **Non si copia la tabella `integrations`.** Ha l'id del calendario Google di produzione e il segreto cifrato con la stessa chiave: lo staging scriverebbe le prenotazioni di prova **sul calendario vero**.
2. **I dati personali** (3 clienti, 4 prenotazioni, 4 utenti di accesso con le password cifrate) finirebbero in un ambiente meno protetto (CI, anteprime) che l'informativa non menziona. Proposta: copiare i clienti **resi anonimi** (nome «Cliente 1», email `…@example.test`, telefono vuoto) e **non** gli utenti di accesso (si creano utenti di prova; l'admin di sviluppo resta).
3. **Le foto e i video**: la tabella `media` contiene solo le chiavi dei file, che stanno nel bucket di produzione. Il bucket di sviluppo non li ha: o si copiano (serve un accesso a entrambi i bucket), o il test legge le foto dal dominio pubblico di produzione (solo in lettura, ma i caricamenti dal pannello andrebbero ancora nel bucket di sviluppo), o restano rotte.

## Come si fa (proposta)
Tutto con uno script in `scripts/` (o nello scratchpad se si usa una volta sola) che **rifiuta di scrivere** se il database di destinazione non è quello di sviluppo (come `scratchpad/test-user.mjs`).

### Fase 0 — Decisioni (Kevin)
- [ ] Le scelte in fondo.

### Fase 1 — Rete di sicurezza
- [ ] Copia dei dati di sviluppo di oggi in un file (tutte le tabelle che si toccano), in `temp/`, per poter tornare indietro.
- [ ] Elenco di ciò che sparisce dallo sviluppo (modelli di prova come «Test Model for rent», prenotazioni di prova): Kevin lo vede prima.

### Fase 2 — Lettura da produzione (sola lettura)
- [ ] Per ogni tabella copiata, `select` delle righe con le **sole colonne che esistono in produzione** (le colonne delle migrazioni `0017`–`0025` non ci sono: nel test prendono il valore predefinito).
- [ ] Tabelle, nell'ordine delle chiavi esterne: `bike_categories`, `route_bike_categories`, `bike_sizes`, `bike_versions`, `bike_models`, `bike_model_translations`, `bike_model_sizes`, `bike_model_versions`, `bike_units`, `routes`, `route_translations`, `media`; con la decisione 1 anche `customers` (anonimi) e `bike_reservations`.
- [ ] **Mai** `integrations`, `auth.users`, né chiavi.

### Fase 3 — Scrittura in sviluppo
- [ ] Svuotare le tabelle di destinazione (ordine inverso) e inserire le righe (`insert … on conflict do nothing` con gli id di produzione, così i collegamenti restano), in un solo passaggio per tabella.
- [ ] Rimettere in ordine ciò che dipende dagli id: le righe di sviluppo che puntano a modelli cancellati (prenotazioni e clienti di prova) vanno via prima.
- [ ] Le **foto** (decisione 3).

### Fase 4 — Controllo
- [ ] Stessi conteggi per tabella; un campione di righe uguali.
- [ ] Confronto del contenuto **staging contro produzione** (CLAUDE.md: confrontare con la produzione): home, `/it/bikes`, un modello, `/it/routes`, sitemap (titoli, prezzi, ordine, link ai media).
- [ ] L'ordine per categoria e i prezzi delle bici di produzione nella pagina `/rent`.
- [ ] `npm run test:db` ancora verde (i test usano proprie righe `db-test-*`).

### Fase 5 — La prova della pubblicazione (il vero scopo)
- [ ] Le migrazioni `0017`–`0025` provate **su una copia con i dati di produzione**: oggi lo sviluppo è già alla `0025`, quindi la prova vera richiede un database fermo alla `0016`. Due strade: (a) un **branch di Supabase** (a pagamento) creato dalla produzione e migrato con `npm run db:migrate`; (b) un Postgres locale caricato con le righe della Fase 2. Da scegliere con Kevin.
- [ ] Il flusso di prenotazione con Stripe (chiavi di prova) sul catalogo vero, fino al webhook.
- [ ] Le voci della lista «Per il rilascio» di `prenotazioni-punti-aperti.md`, una per una, sul test.

## Cosa non fa
Non tocca produzione, non copia segreti, non sposta file dai bucket senza che Kevin decida (decisione 3), non rende il test un duplicato continuo (è una copia a un istante: si rifà quando serve).

## Risposte di Kevin (2026-10-13) e come si procede
- **Dati**: solo il catalogo (niente clienti né prenotazioni). **Foto e video**: si **copiano** nel bucket di sviluppo. **Migrazioni**: i due progetti Supabase sono separati; i dati di produzione si portano **nello schema
  già migrato del test** (`0026`), cioè «le migrazioni si applicano ai dati»; **produzione non si tocca**.
- Produzione si **legge** con l'MCP (`execute_sql`, sola lettura): non c'è una connessione diretta sul PC e i dati sono piccoli (circa 100 KB). Ogni tabella passa come un unico `jsonb` e si inserisce con
  `jsonb_populate_recordset`: le colonne che il test ha in più (`bike_models.color`) restano vuote e le riempie lo stesso calcolo della `0026`; quelle che ha solo produzione
  (`route_translations.start_point_label`: nel codice non esiste) si lasciano. **Controllo**: l'impronta (`md5`) di ogni tabella in produzione e nel test, sulle colonne comuni.
- I file si scaricano dal dominio pubblico di produzione (solo lettura, senza chiavi) e si caricano nel bucket di sviluppo con le chiavi di sviluppo.

## Avanzamento
- [ ] 1 Copia di sicurezza dei dati di sviluppo (`temp/`, fuori da git) e elenco di ciò che dipende dal catalogo (prenotazioni, ecc.)
- [ ] 2 Svuotare le prenotazioni di prova di sviluppo e il catalogo di sviluppo (ordine inverso delle chiavi esterne)
- [ ] 3 Inserire le righe di produzione, tabella per tabella (ordine delle chiavi esterne); colori dei modelli come nella `0026`
- [ ] 4 Impronte uguali tabella per tabella
- [ ] 5 Copiare i file (foto con le loro versioni, flussi video, GPX) nel bucket di sviluppo; controllo a campione
- [ ] 6 Controllo a occhio: home, `/it/bikes`, `/it/routes`, `/rent`, `/manage/bikes` sul test contro produzione; `npm run test:db` ancora verde
- [ ] 7 Lo script resta riusabile? (per rifare la copia quando serve: oggi è un passaggio a mano con l'MCP; se Kevin mette una connessione di sola lettura a produzione in `.env.local` si può trasformare in uno script)
