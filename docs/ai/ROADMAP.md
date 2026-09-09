# Roadmap

> Quattro orizzonti, una riga per voce. Le idee che meritano dettaglio hanno una scheda in
> `ideas/`. Quando una voce entra in implementazione diventa una spec in
> `docs/superpowers/specs/` e qui resta il puntatore.
>
> **"Scartato" non è decorativo**: serve a non far riproporre a nessuno un'idea già
> valutata e bocciata.

## Adesso

_(niente in lavorazione)_

## Prossimo

- **Video fantasma a storage irraggiungibile** — con MinIO giù il video compare lo stesso
  con la scritta "Video in elaborazione", invece di sparire come faceva prima. Sospetto
  che la cache Redis del manifesto (7 giorni) lo faccia risultare pronto anche quando lo
  storage non risponde. Da decidere: se un errore di rete debba invalidare la voce, e che
  messaggio mostrare — "in elaborazione" è falso quando il problema è lo storage.

- **Il worker espone la secret key** — la passa come argomento a `mc`, quindi finisce nei
  log del container e in `ps`. Va letta da variabile d'ambiente o da file.
- **Suite di test, fase 1** — fondamenta vitest con ambiente DOM, più i test su `proxy.ts`
  e sull'allineamento delle chiavi dei dizionari. → `docs/superpowers/specs/2026-09-09-test-suite-design.md`
- **Test di ogni pagina e budget di prestazioni** — richiesti esplicitamente dopo che una
  regressione da 40× è arrivata in produzione senza che nulla la fermasse. Devono
  verificare il **contenuto**, non il codice HTTP: qui una pagina spenta risponde 200.
- **Suite di test, fase 2** — finti servizi dietro `USE_FAKE_SERVICES`, per lavorare a
  Supabase o R2 irraggiungibili e per far girare build ed end-to-end in CI.
- **Regole di dominio come skill di progetto** — previste dalla spec del sistema di
  documentazione, non ancora scritte: `nextjs-16`, `i18n`, `db-migrations`,
  `media-storage`, `maps`.

## Un giorno

- **Rendere reale la cache delle pagine percorsi.** Oggi `revalidate = 3600` non ha effetto
  perché il layout radice legge `headers()`. Recuperarla significa ripensare come arriva la
  lingua, ed è la voce con il maggior guadagno su prestazioni e costi.
- **Riscrivere `README.md`**, che descrive rotte e stack non più esistenti. È il documento
  per lettori umani e va trattato come tale, non fuso con `STATE.md`.
- **Sistemare i tre `set-state-in-effect`** in `mobile-menu.tsx` e `route-card-media.tsx`,
  oggi declassati ad avviso in `eslint.config.mjs`.
- **Flags Explorer nella Vercel Toolbar** — permette di sovrascrivere un flag solo per sé
  dal browser, senza toccare ciò che vedono i visitatori.
- **Ridurre il tetto di attesa a freddo dei flag** da 1,5 s a poche centinaia di
  millisecondi, ora che i flag esistono e la valutazione è rapida.

## Scartato

- **Precomputation dei feature flag** — pensata per pagine statiche servite dalla CDN. Qui
  non serve: tutte le rotte sono già dinamiche, quindi porterebbe fino a 32 varianti di
  pagina senza alcun guadagno.
- **Variabili d'ambiente come sorgente dei feature flag** — sostituite da Vercel Flags il
  2026-09-09. Sono legate al singolo deployment, quindi spegnere una sezione costava una
  build. Sopravvivono solo come override di sviluppo.
- **Conversione geoide→ellissoide per la traccia 3D** — avrebbe corretto lo scarto
  sistematico di −46 m ma non la dispersione di ±29 m dovuta al DEM, lasciando la traccia
  sepolta a tratti. Ancorare al terreno risolve entrambi.
- **Test end-to-end del flyover 3D** — WebGL headless più un token Cesium Ion: lento,
  ballerino, e verrebbe disattivato al primo fallimento casuale. Meglio un buco dichiarato.
- **404 vero al posto del 200 per una sezione spenta** — si otterrebbe spostando il
  controllo in `proxy.ts`, al prezzo di perdere la pagina "Pagina non trovata" curata. Il
  `noindex` iniettato da Next copre già il lato SEO.
