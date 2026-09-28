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
allt visat på `/dev/ui` (finns bara i dev-läge; där provas också mörkt läge).
Identiteten heter "lugn expertis" (ritning v2, avsnitt 3): varm botten
(papper, inte kräm), djup blågrön primär, bärnsten som enda accent, en
typsnittsfamilj (Schibsted Grotesk 400/500/600, självhostad), serif bara i
brevet från läkaren. Pillerknappar utan pilar. Logotyp A ("pricken")
genereras av `scripts/rita-logotyp.py` till `public/logo/` och
`src/components/brand/logo-paths.ts`; komponenten är `src/components/brand/logo.tsx`.

Reglerna står i app.css-huvudet och gäller all UI-kod:

- Blågrön betyder "svarar på tryck". Etiketter och rubriker är aldrig blågröna.
- Radier: knapp = piller, kontroll = xl, kort = 2xl, blad = 3xl.
- Ikoner: lucide, 24 px, linje 1,75 (aktiv 2,25). Inga emojis.
- Kort har kant, ingen skugga. Skugga bara på det som svävar.
- Tryckrespons vid nedtryck (`pressable`, `active:`), aldrig bara vid släpp.
  Rörelselängder `motion-fast/base/slow`; fjäder utan överskjut som standard.
- Lager: `z-(--z-nav)`, `z-(--z-sheet)`, `z-(--z-notice)`.
- Kontraster mäts, inte gissas: text ≥ 4,5:1, kontrollkanter ≥ 3:1
  (`--color-input`), platshållare ≥ 4,5:1 (`--color-faint`).
- `html` har `font-size: 106.25%`, aldrig ett px-tal: storleken följer
  användarens inställning.
- Tailwinds standardpalett är borttagen med flit (`--color-*: initial`): det
  finns ingen `red-500` att nå. Risknivåer bärs av ord, aldrig av rött/grönt.
- Namnen följer shadcn/ui och `components.json` finns, så
  `bunx shadcn@latest add <komponent>` fungerar. Kontrollera den genererade
  komponenten mot tokens och regel 3 innan den används.
- Nya byggstenar visas på `/dev/ui` i samma commit som de skapas. En byggsten
  som inte visas där finns inte.
- `bun run shots` renderar sidorna till `shots/` (förra körningen i
  `shots/forra/`) så att en ändring går att jämföra bild mot bild. Kräver
  `bunx playwright install chromium` en gång.
- `/dev/identitet` är identitetsprovet från steg 1.4 (beslutsunderlag).
  Provtypsnitten där laddas bara på den sidan.
- Mörkt läge: tokens finns under `:root[data-theme="dark"]` och är
  kontrastmätta, men slås på först i ett eget steg (systemföljning + val i
  profilen).

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
