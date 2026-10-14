# Un colore per ogni modello di bici (primo uso: Google Calendar)

> **Da approvare, non iniziato** (Kevin, 2026-10-13: «poter assegnare, e che venga anche assegnato automaticamente un colore ad ogni modello di bici, a scopo organizzativo; il primo
> posto in cui voglio usarlo è Google Calendar»; poi: «è possibile inserire colori custom o è obbligatorio basarsi su quelli di Google Calendar?»). `[ ]` da fare, `[~]` in corso, `[x]` fatto.
> Va su un **ramo a parte** (`feat/model-colors`, da `staging`), con una migrazione. Solo `staging`, mai produzione. Privacy: nessun dato di persone.

## Cosa c'è già (letto nel codice)
- L'evento su Google nasce da `wantedEvent()` (`lib/integrations/google-calendar/events.ts`), funzione pura. Ha già un `colorId` per la manutenzione (grafite, `'8'`); i noleggi non hanno colore.
- Chi legge le prenotazioni per il calendario è `lib/integrations/google-calendar/data.ts` (una query con modello, taglia e versione).
- «Sync now» e il controllo giornaliero rifanno **ogni** evento della finestra (`reconcile` → `applyReservation`).
- `bike_models` non ha nessuna colonna di colore (ultima migrazione: `0025`).

## Colori personalizzati: sì, dal 7 luglio 2026 (verificato sulla documentazione ufficiale)
Prima un evento accettava solo gli 11 colori fissi di Google (`colorId`). **Da luglio 2026 Google ha le «etichette» (disponibili a tutti, «Generally Available»)**: ogni calendario ha un elenco di etichette
(`labelProperties.eventLabels`: `id`, `backgroundColor` in esadecimale, `name` facoltativo; **fino a 200**) e un evento ne sceglie una con `eventLabelId`. Fonti: guida
[Labels](https://developers.google.com/workspace/calendar/api/guides/labels), [Events](https://developers.google.com/workspace/calendar/api/v3/reference/events), [note di rilascio del 7 luglio 2026](https://developers.google.com/workspace/calendar/release-notes).
Le regole che ci riguardano:
- Le etichette si definiscono con `Calendars.update` (si legge l'elenco, si modifica, si riscrive **tutto**: un elenco incompleto cancella le altre).
- **Per definirle serve il ruolo `owner` sul calendario**; per assegnarle a un evento basta `writer`. Oggi il nostro account di servizio probabilmente ha solo `writer` («Apporta modifiche agli eventi»): per le etichette va alzato a
  «Apporta modifiche e gestisci condivisione». **Da verificare dal vivo** (la guida non parla degli account di servizio).
- Scrivendo un evento bisogna aggiungere `?eventLabelVersion=1`; con quel parametro `colorId` viene **ignorato** (anche il grafite della manutenzione diventa un'etichetta).
- Cambiare il colore dell'etichetta ricolora **da sola** tutti gli eventi che la usano: non serve risincronizzarli.

## Proposta (con colori personalizzati)
- Colonna `bike_models.color` (esadecimale `#rrggbb`, con un controllo del database sul formato).
- **Etichetta di Google = il modello**: `id` dell'etichetta = id del modello (è un UUID), `name` = nome italiano del modello, `backgroundColor` = il suo colore. Nessun altro dato da conservare.
  Un'etichetta in più, «Manutenzione», grigia, per le manutenzioni.
- **Assegnazione automatica**: dalla tavolozza del sito (`lib/bike-colors.ts`, una quindicina di colori ben distinti, leggibili con testo bianco), il **meno usato**, a parità il primo. I modelli esistenti si riempiono nella migrazione.
- **A mano**: nel modulo del modello, una fila di campioni della tavolozza **più** un campo «colore a scelta» (il selettore di colore del browser, senza librerie). Un colore a scelta è valido se leggibile (contrasto minimo, controllato con una libreria, non a occhio).
- **Sincronizzazione**: prima di scrivere gli eventi si **allineano le etichette** del calendario (una lettura e una scrittura dell'elenco completo, solo se qualcosa è cambiato); gli eventi dei noleggi portano `eventLabelId` = id del modello.
  Salvando un modello con un colore o un nome cambiato si aggiorna la sua etichetta (e basta). «Sync now» riallinea tutto.
- **Se il calendario non ha il permesso `owner`** (o Google rifiuta le etichette): ripiego sul colore fisso più vicino fra gli 11 di Google (`colorId`), e un avviso in *Activity* dell'integrazione che dice di alzare il permesso. Così nulla si rompe.
- Il pannello: un pallino del colore accanto al nome nell'elenco dei modelli e (facoltativo) davanti alla riga della bici nel calendario `/manage/bookings`.

## Compiti
- [ ] Risposte di Kevin alle domande in fondo.
- [ ] **Prova dal vivo prima di tutto** (`live.test.ts`, `LIVE_GOOGLE_CALENDAR=1`): con l'account di servizio, leggere `labelProperties`, scrivere un'etichetta e creare un evento con `eventLabelId` + `?eventLabelVersion=1`;
  vedere che esito ha con `writer` e con `owner`; guardare l'evento nel Calendar aperto da Kevin (web e telefono). Il client attuale (`client.ts`) deve poter passare il parametro: verificarlo.
- [ ] `lib/bike-colors.ts`: tavolozza, `nextColor(used)`, contrasto (libreria) + test (meno usato, a parità il primo, oltre la tavolozza si ripete).
- [ ] Migrazione `0026` (`npx drizzle-kit generate`, `npm run db:migrate`, solo sviluppo): colonna `color` con `CHECK`, riempimento dei modelli esistenti nell'ordine `display_order`. Test del database sul vincolo.
- [ ] Azioni dei modelli: creare assegna `nextColor`; salvare accetta `color` (`zod`); `updateTag('bike-models')`; dopo un cambio di colore o nome, `after()` aggiorna l'etichetta (mai far fallire il salvataggio).
- [ ] Modulo del modello: campioni + colore a scelta.
- [ ] `data.ts` legge colore e id del modello; `events.ts` dà `eventLabelId` (funzione pura, con test: noleggio con etichetta, manutenzione con la sua, nessun colore → nessuna etichetta).
- [ ] Un pezzo nuovo `labels.ts` nell'integrazione: «etichette volute» (dai modelli) contro «etichette presenti» (dal calendario), e la scrittura dell'elenco completo senza toccare le etichette che non sono nostre (quelle messe a mano da Kevin restano).
- [ ] Il ripiego su `colorId` quando mancano i permessi + riga in *Activity*; la guida dell'integrazione (`guide.ts`) dice di dare il permesso «gestisci condivisione» all'account di servizio.
- [ ] Pannello: pallino nell'elenco dei modelli.
- [ ] Controllo a occhio: modulo (320/1440), Google Calendar aperto con due modelli di colore diverso, cambio di colore che ricolora gli eventi.
- [ ] `STATE.md` (le etichette di Google, il permesso `owner`, il ripiego) e `prenotazioni-punti-aperti.md`.

## Risposte di Kevin (2026-10-13) e decisioni
1. Colori a scelta tramite le etichette di Google, **con il nome del modello** come nome dell'etichetta: sì. (Un controllo di contrasto non serve: Google sceglie da solo il colore del testo; i colori della tavolozza sono scelti a mano.)
2. Alzare l'account di servizio a «Apporta modifiche e gestisci condivisione»: **sì** (lo fa Kevin nelle impostazioni del calendario: Condivisione → persona → permessi).
3. Noleggi online e al banco dello stesso modello: **stesso colore**; la manutenzione ha il suo colore grigio.
4. Per ora **solo Google** (niente pallino nel pannello).
- Nessuna libreria nuova: il formato `#rrggbb` si controlla con `zod` e il campo del browser `<input type="color">`; il colore fisso più vicino (ripiego) si calcola con una distanza fra i tre canali.
- Le etichette che non sono nostre (quelle messe a mano) non si toccano mai; un'etichetta di un modello cancellato resta nel calendario (innocua, se ne occupa Kevin).
- Next.js: `after()` dentro un'azione del server (letto `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`: ammesso nelle Server Functions).

## Prova dal vivo (2026-10-13, con la chiave del calendario di sviluppo)
- Lettura di `labelProperties` con l'account di servizio (ambito `calendar`): **riuscita**; il calendario ha già **24 etichette** (vanno conservate: si riscrive sempre l'elenco completo).
- Scrittura di un'etichetta: **403 `requiredAccessLevel` «You need to have owner access to this calendar»**, come previsto: serve il permesso di Kevin (punto 2).
- La libreria `@googleapis/calendar` 20.1.0 conosce già `eventLabelId`, `eventLabelVersion` e `labelProperties`.
- Per leggere/scrivere le etichette l'ambito dell'account di servizio passa da `calendar.events` a `calendar` (l'accesso resta quello del permesso sul calendario).

## Avanzamento
- [x] Domande risolte; prova dal vivo di lettura e scrittura (la scrittura aspetta il permesso).
- [x] T1 `lib/bike-colors.ts` (12 colori, `nextModelColor`, `hexColorSchema`) + test · [x] T2 migrazione `0026` (colonna, CHECK, riempimento) applicata allo sviluppo; un test tiene l'elenco SQL uguale a quello del codice
- [x] T3 `labels.ts` (`wantedLabels`, `mergeLabels`, limite 200, etichette non nostre conservate) + test · [x] T4 `events.ts` (etichetta o colore fisso, manutenzione grigia) + `fixed-colors.ts` (i colori fissi verificati sull'API) + test
- [x] T5 `SyncApi`/client (`readLabels`, `writeLabels`, `eventLabelVersion`, ambito `calendar`) + fake nel test del motore · [x] T6 `sync.ts` (`prepareColours`: etichette prima di ogni sincronizzazione, ripiego e avviso in Activity, `syncModelLabels`) + test
- [x] T7 azioni dei modelli (`color` nello schema, il nuovo modello prende il colore meno usato, `after(syncModelLabels)` dopo il salvataggio) · [x] T8 modulo del modello (campioni + «Other», provato a 1280 px)
- [x] T9 prova dal vivo (2026-10-13, dopo che Kevin ha alzato l'account di servizio a «gestisci condivisione»): `live.test.ts` verde (etichetta definita, evento con `eventLabelId`, colore cambiato, pulizia) e un «Sync now» vero sul calendario di sviluppo: 3 etichette aggiunte alle 24 di Kevin (27), 3 eventi con l'etichetta del modello, nessun avviso in Activity
- [~] T10 documenti: `STATE.md` e guida dell'integrazione fatti; resta la PR (aspetta il via di Kevin) e `prenotazioni-punti-aperti.md` (per il rilascio: migrazione `0026`, e il permesso «gestisci condivisione» sul calendario di PRODUZIONE)
