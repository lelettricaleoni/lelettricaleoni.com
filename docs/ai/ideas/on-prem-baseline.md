# Punto di partenza: il sito su Vercel (2026-10-05)

> Per confrontare il sito sul server Oracle con quello di oggi. Spec: `docs/superpowers/specs/2026-10-05-on-prem-deploy-design.md`.
> Misurato da una sola rete (il computer di Kevin, in Italia), con `curl`: 12 richieste per pagina dopo una di riscaldamento,
> sul dominio di produzione. Il TTFB comprende il tempo di rete fino a Vercel: serve come ordine di grandezza, e va
> ripetuto **dalla stessa rete** sul server.

| Pagina | TTFB mediano | TTFB 95° | Totale mediano | Peso |
|---|---|---|---|---|
| `/it` | 214 ms | 266 ms | 311 ms | 121 KB |
| `/it/bikes` | 211 ms | 229 ms | 448 ms | 124 KB |
| `/it/routes` | 207 ms | 222 ms | 500 ms | 349 KB |
| `/it/bikes/<id>` | 216 ms | 237 ms | 620 ms | 172 KB |
| `/it/routes/<id>` | 210 ms | 236 ms | 557 ms | 175 KB |
| `/it/noleggio-e-bike` | 205 ms | 234 ms | 251 ms | 85 KB |
| `/sitemap.xml` | 179 ms | 183 ms | 185 ms | 52 KB |

Intestazioni della home: `Cache-Control: public, max-age=0, must-revalidate`, `X-Vercel-Cache: PRERENDER`. La cache di Vercel
risponde senza far girare il sito; sul server ogni richiesta alle pagine che leggono dati (`await connection()`) fa girare Next.

Con la build di produzione **in locale** (senza rete di mezzo, dopo la rimozione dei flag): `/it` ~30 ms, `/it/bikes` ~75 ms,
`/it/routes` ~110 ms: è il costo di renderizzare, da sommare alla rete.

Soglia di accettazione proposta per la prova di carico su staging (fase 4 della spec): TTFB mediano delle pagine pubbliche non
peggiore di +150 ms rispetto a questa tabella, e 95° percentile sotto 500 ms **mentre il worker trascodifica un video**.
