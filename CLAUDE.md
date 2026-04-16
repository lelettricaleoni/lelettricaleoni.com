@AGENTS.md

## Progetto
Sito coming soon per "L'Elettrica Leoni" — noleggio e-bike (Flyer) + riparazioni, Dro (TN).
Stack: Next.js 16.2.4 · React 19 · Tailwind v4 · shadcn/ui · TypeScript · App Router.
i18n nativo (IT/EN/DE): `proxy.ts` + `app/[lang]/` + `messages/{it,en,de}.json`.

## Next.js 16 — gotchas critici
- `middleware.ts` deprecato → usa `proxy.ts` con `export function proxy()`
- Root `app/layout.tsx` DEVE avere `<html>` e `<body>` — `return children` causa runtime error
- `params` / `searchParams` sono Promise → sempre `await params`
- `viewport` è export separato: `export const viewport: Viewport = { ... }`

## i18n — architettura adottata
- `proxy.ts` rileva locale, fa redirect, inietta header `x-locale` via `NextResponse.next({ request: { headers } })`
- `app/layout.tsx` legge `x-locale` con `await headers()` e imposta `<html lang>`
- `app/[lang]/layout.tsx` gestisce solo `generateMetadata` + `generateStaticParams`, restituisce `<>{children}</>`
- Dizionari in `messages/` caricati via `getDictionary(locale)` in `app/[lang]/dictionaries.ts` (con `server-only`)
- Dipendenze i18n: `negotiator`, `@formatjs/intl-localematcher`, `server-only`

## shadcn/ui
- `npx shadcn@latest init` è interattivo — preferire: crea `components.json` manualmente + `npx shadcn@latest add <componenti>`
- Installare anche: `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `lucide-react`
- `lucide-react` non include icone di brand (es. Instagram) → usare SVG inline

## Comandi utili
- `npm run dev` — dev server su http://localhost:3000
- `npm run build` — verifica TypeScript + build produzione
