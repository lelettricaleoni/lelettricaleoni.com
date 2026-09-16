---
name: db-migrations
description: "Use when changing the database schema, writing or running Drizzle migrations, touching Supabase Auth/admin access, or debugging a connection-pool or timeout issue against Postgres. Triggers: editing lib/db/schema.ts, running drizzle-kit generate/migrate, adding a query, granting admin access, or a page hanging/timing out on a DB-backed route."
---

# Database e migrazioni in questo progetto

Postgres su **Supabase**, via **Drizzle ORM** (`drizzle-orm/postgres-js`). Schema in
`lib/db/schema.ts` (`routes`, `route_translations`, `route_photos`), tabella di tracking delle
migrazioni funzionante dal 2026-09-14 — la storia di prima è in
`lib/db/migrations/_archive-2026-09-14/README.md`.

## Due URL diversi, due usi diversi

- **`DATABASE_URL`** — quella che usa l'app in esecuzione (`lib/db/index.ts`). Va **sempre**
  attraverso il pooler in transaction mode. `lib/db/pooler.ts` (`transactionPoolerUrl`) corregge
  la porta a 6543 anche se la variabile su Vercel dice 5432 (porta di session mode) — la
  variabile è un *Secret* su Vercel e nessuno può rileggerla per controllare, quindi la
  correzione è nel codice, non nella disciplina.
- **`DATABASE_DIRECT_URL`** — quella che usa `drizzle-kit` (`drizzle.config.ts`), connessione
  diretta, non attraverso il pooler.

## Generare e applicare una migrazione

```bash
npx drizzle-kit generate   # genera SQL in lib/db/migrations/, dallo schema.ts
npx drizzle-kit migrate    # applica al database (richiede DATABASE_DIRECT_URL)
```

Ambienti separati dal 2026-09-14: **sviluppo e produzione hanno ciascuno il proprio progetto
Supabase**, non condividono più database né pooler (dettagli e credenziali in
`docs/environment-variables.md`). Applica sempre una migrazione a entrambi, non solo a quello
che stai guardando.

## Il pool di connessioni è piccolo apposta — perché

`max: 3` in `lib/db/index.ts`, non un numero più comodo. Fluid Compute riusa una stessa
istanza calda fra richieste concorrenti, quindi più richieste possono condividere lo stesso
client `postgres.js` e la sua coda interna — che **non ha un proprio timeout**. Un pool troppo
grande nasconde il problema finché il traffico non lo saturerà comunque; uno piccolo lo fa
emergere subito in sviluppo.

**La trappola reale, successa due volte**: una query per elemento dentro un `Promise.all`
(fetch di una lista, poi una query di dettaglio per ciascun elemento) satura queste tre
connessioni molto più in fretta di quanto sembri — sette percorsi pubblicati bastavano. Prima
di aggiungere una nuova lista con dati correlati, chiediti se serve un `.innerJoin()` /
`.leftJoin()` invece di un giro per elemento. Vedi `lib/routes-data.ts` e
`lib/actions/routes.ts` (`getRoutesForAdmin`) come esempio del fix.

`statement_timeout` per connessione **non funziona** con questo pooler: Supavisor in
transaction mode può assegnare a uno statement successivo un backend diverso da quello che ha
ricevuto il parametro di avvio (verificato con `show statement_timeout` subito dopo la
connessione — tornava vuoto). Il timeout di 2 minuti visto in produzione è impostato altrove,
non per connessione da codice applicativo.

## Ruoli Supabase Auth

`getAdminUser()` (`lib/supabase/server.ts`) richiede **`app_metadata.role === 'admin'`** —
mai `user_metadata`, che è scrivibile dall'account stesso e quindi non è un controllo di
sicurezza valido. Il primo amministratore va impostato dalla dashboard Supabase
(Authentication → Users → `raw_app_meta_data`); da lì si gestisce da `/manage/users` nel
pannello stesso. Lo stesso controllo vive anche in `proxy.ts` per la protezione di `/manage`.
