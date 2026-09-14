# Migrazioni precedenti al 2026-09-14

Questo repository non ha mai davvero usato `drizzle-kit migrate`: nessuna delle due
basi dati aveva la tabella `drizzle.__drizzle_migrations`, e questo `_journal.json`
non aveva le voci per `0002` e `0003`, già vive nello schema reale — applicate a mano,
non tramite lo strumento.

Invece di ricostruire a mano cinque snapshot storici cercando di indovinare uno stato
intermedio mai stato tracciato correttamente, questi file sono stati archiviati e
sostituiti da un'unica baseline (`0000_reset_baseline.sql`) generata da
`drizzle-kit generate` contro lo schema reale del 2026-09-14 — verificata con
`drizzle-kit migrate` sia in sviluppo che in produzione: nessuna riga eseguita, solo
la tabella di tracking creata e popolata con l'hash della nuova baseline.

Restano qui solo come riferimento storico su come si è arrivati allo schema di oggi.
