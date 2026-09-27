# CLAUDE.md — skintel

Kort och sant. Uppdateras i samma commit som det den beskriver ändras.

## Vad det här är

Skintel: en svensk vårdtjänst där en namngiven hudläkare bedömer foton av
hudfläckar, som personalförmån via arbetsgivare och för privatkunder. Det här
repot är den nya sajten (`skintel.se`), byggd från grunden 2026-09-28 som en
mobile-first PWA. Ritningen den följer: `produkt/ritning-v2-ny-hemsida.md` i
Claude-projektet Skintel. Föregångaren `hud-koll` är lämnad; databasen följde
med.

## Stack

Vite + React 19 + TypeScript, TanStack Router (filbaserad, `src/routes/`,
`src/routeTree.gen.ts` genereras — redigera aldrig), Tailwind v4,
`@supabase/supabase-js` direkt mot RLS och RPC:er, Supabase Edge Functions
(`supabase/functions/`) för det som kräver service-role, `vite-plugin-pwa`.
Ingen SSR, inga serverfunktioner. Pakethanterare: bun.

- `bun run dev` — dev-server på `http://localhost:8080`, nåbar från mobilen på datorns LAN-adress
- `bun run build` — bygger `dist/` och typkontrollerar
- `bun run test` — vitest
- `npx supabase db push` — kör nya migrationer mot den länkade databasen
- `npx supabase db query --linked -f scripts/kolla-rls.sql` — behörighetskontrollerna, körs efter varje migration

## Designsystemet

Tokens i `src/styles/app.css` (`@theme`), komponenter i `src/components/ui/`,
allt visat på `/dev/ui` (finns bara i dev-läge). Identiteten heter "lugn
expertis" (ritning v2, avsnitt 3): varm botten, djup blågrön primär, bärnsten
som enda accent, Fraunces för rubriker och DM Sans för resten, självhostade.

- Tailwinds standardpalett är borttagen med flit (`--color-*: initial`): det
  finns ingen `red-500` att nå. Risknivåer bärs av ord, aldrig av rött/grönt.
  Behövs en färg: lägg till en token med ett namn som säger vad den är till för.
- Namnen följer shadcn/ui (`background`, `primary`, `muted-foreground` …) och
  `components.json` finns, så `bunx shadcn@latest add <komponent>` fungerar.
  Kontrollera den genererade komponenten mot tokens och regel 3 innan den
  används.
- Nya byggstenar visas på `/dev/ui` i samma commit som de skapas.

## Databasen

Supabase-projekt `npaktlkeqsugckubccbn` (Frankfurt). Migrationerna i
`supabase/migrations/` är historiken; **fråga databasen, inte filerna** när
du vill veta vad som gäller (`npx supabase db query --linked "..."`). Nya
ändringar = ny migrationsfil, aldrig redigering av gamla. `20260812143321` är
en dubblett som redan är registrerad som körd — rör den inte. Hänvisningar
till `KNOWN_ISSUES.md` och `docs/…` i migrationer, skript och edge-funktioner
avser filerna i `hud-koll` (git-historiken där); de följde inte med hit.

Behörigheten bor i databasen. Klienten använder den publika nyckeln; det som
kräver service-role ligger i edge-funktioner som själva saknar
behörighetslogik och frågar en RPC (`assert_admin_session()` m.fl.) innan de
gör något.

## Regler som inte får brytas (bakgrund i ritningen)

1. AI-bedömningen visas aldrig för någon utom plattformsadmin i kalibreringsvyn.
2. Ingen automatisk triage eller prioritering utifrån beräknad risk.
3. Ingen marknadsföringstext med medicinskt syfte, och ordet "AI" finns inte i patient- eller säljtext.
4. Behörigheten bor i databasen (RLS/RPC), inte i klienten.
5. Arbetsgivaren får aldrig veta vem som använt tjänsten — inga realtidsräknare, inget under 25 medlemmar, inget kumulativt.
6. Journalhandlingar bevaras minst tio år; kontoradering raderar bara det som inte är journal.
7. Inga modellvikter tränade på icke-kommersiell data i produkten.
8. Åldersgräns 18 år i databasen, klienten och villkoren.
9. Granskaren ser inte bilden innan hen antagit ärendet; kön visar aldrig kundidentitet.
10. Tvåfaktor är tvingande för dermatologer och plattformsadmin.
11. I Capacitor sätts aldrig `server.url` mot den hostade sajten.

## Arbetssätt

Ett avgränsat steg per commit, testat i mobilen. Aldrig rebase — merge.
Invarianter ska vara körbara: varje åtgärdat fynd får en kontroll i
`scripts/kolla-rls.sql`. Byt signatur hellre än att lägga till en valfri
parameter. Rätta dokumentationen i samma commit som svaret kommer.
