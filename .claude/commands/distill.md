---
description: Promuove i fatti stabili dal journal in STATE.md e le idee in ROADMAP.md
---

Distilla il journal delle sessioni AI.

## Cosa fare

1. **Leggi le voci non distillate.** In ogni file di `docs/ai/journal/`, sono le voci il
   cui marcatore `<!-- ts:... -->` è successivo al `<!-- distilled-through: ... -->` in
   testa al file. Se il marcatore manca, sono tutte.

2. **Promuovi in `docs/ai/STATE.md`** i fatti che si sono stabilizzati: decisioni
   vincolanti col loro perché, trappole scoperte, debito emerso, cambi di ambiente.

   Applica la regola di ammissione senza sconti: **entra solo ciò che il codice non dice
   già.** Una cronaca di cosa è stato fatto non entra — quella resta nel journal. Se
   `STATE.md` supera le ~150 righe, hai promosso qualcosa che non doveva entrare: togli,
   non allargare il tetto.

   Verifica ogni affermazione contro il codice prima di scriverla. Una voce di journal
   descrive cosa sembrava vero allora, non cosa è vero adesso.

3. **Promuovi in `docs/ai/ROADMAP.md`** le idee emerse, nell'orizzonte giusto. Un'idea
   valutata e scartata va in **Scartato con il motivo**: serve a non farla riproporre.
   Se merita dettaglio, aprile una scheda in `docs/ai/ideas/`.

4. **Aggiorna il marcatore** in testa a ogni file mese toccato, con il `ts` della voce più
   recente che hai distillato:

   ```
   <!-- distilled-through: 2026-09-09T14:32:11Z -->
   ```

5. **Non potare il journal.** È l'archivio: le voci grezze restano. `STATE.md` è il
   documento di lavoro, il journal è la storia.

## Come riportare

Elenca cosa hai promosso e dove, e cosa hai deliberatamente lasciato nel journal e perché.
Se nulla meritava di essere promosso, dillo: è un esito legittimo.
