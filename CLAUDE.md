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
- `bun run dev:https` — samma över https (självsignerat, godkänns en gång i telefonen): kameran i sökaren finns bara i en säker kontext, och LAN-adressen över http är ingen
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

## Inloggning (steg 1.5)

Huvudvägen är en sexsiffrig engångskod till e-post (`src/lib/auth.ts`); ingen
magisk länk, inga lösenord för riktiga användare. Konto skapas bara via
`/inbjudan` (arbetsgivarens kod) och senare via köp; `/logga-in` skapar aldrig
konton. Felmeddelanden avslöjar aldrig om en adress finns (`auth-outcome.ts`,
testad). Tvåfaktor (TOTP, `src/lib/mfa.ts`) är tvingande för läkare och admin;
kravet bor i databasen (`reviewer_session_status`, `has_verified_mfa`) och
speglas i klientens grindar (`src/lib/gates.ts`) som bara styr vart man
skickas. Rollhem: dermatolog → `/granska`, HR-admin → `/organisation`, admin →
`/admin`, annars `/app` (`src/lib/roles.ts`, RLS-avgränsade uppslag).

Utanför repot: Supabase-projektets Magic Link-mall måste innehålla
`{{ .Token }}` (satt 2026-08-30), OTP-längd 6 = `CODE_LENGTH`, giltighet 300 s.
Läs längden ur ett levererat mejl, inte ur koden.

Seed-kontona (`scripts/seed-dev-users.sql`, lösenord i `.env.development`)
loggas in från utvecklingspanelen på `/logga-in`, som bara finns i dev-läge --
spärren `import.meta.env.DEV` sitter på anropsstället, inte i komponenten.
Kontona raderas före lansering.

## Kroppsfiguren (steg 3.1, prov)

Figuren är en egen modul i `src/figur/` med ett kontrakt (`kontrakt.ts`):
region, sida, punkt och normal in och ut, samma nycklar och samma rymd som
`spots` i databasen (fötter på y = 0, hjässan 1,93, z+ fram, x+ figurens
vänstra sida). Resten av appen talar bara kontraktet, så 2D-kartan kan bytas
in utan att något annat rörs. Tre kroppar -- neutral, kvinna, man -- görs av
`scripts/rita-figur.py` ur MakeHumans basmodell och makrotargets
(`assets/figur/makehuman/`, CC0; ursprunget står i `assets/figur/README.md`):
morfning, skalning, armarna fällda till 22°, kvadrisk förenkling till
12 000 trianglar, och en region per hörn ur ett kapselskelett byggt av
modellens egna ledmarkörer. Utdata: `public/figur/figur-<kropp>.bin` och
`src/figur/figur-data.ts` (regionlista; per kropp fokuspunkter och siluett).
En markering hör till en kropps rymd: byts kroppen börjar figuren tom.
3D-renderingen (`figur-3d.ts`) är three.js-kärnan utan react-three-fiber,
hämtas först när figuren monteras och ritar bara när något rör sig.
Siluetten (`siluett.tsx`) står på skärmen tills 3D:n är uppe.

Provsidan `/dev/figur` visar mätvärdena och växlar kropp. Mätbygget
`bun run build:prov` + `bun run preview` behåller den sidan med riktig
minifiering. Kraven (ritning v2, 3.1): under 300 kB, första bild inom 2 s på
en Android i mellanklass, 60 fps vid vridning. Bygget 2026-09-28: 135 kB gz
för 3D-delen, 114 kB per kropp (86 gz; bara den valda hämtas), 8 kB omslag.
Spiken är inte avgjord förrän telefonmätningen är gjord; faller den byggs
2D-kartan i SVG mot samma kontrakt.

## Inskicket (steg 3.2)

Patientens inskick är RPC:n `submit_lesion_review(spot, images, symptoms, note)`
(migration `20260928202000`). Rätten att skicka in avgörs där, aldrig i
klienten: aktivt medlemskap i en aktiv organisation med aktivt avtal inom
perioden, eller ett betalt oanvänt köp (`submission_entitlement()`, intern;
`my_submission_entitlement()` för klienten, som bara väljer väg efter svaret).
Potten spärrar aldrig; `subscriptions` räknas inte (planerna kommer med M8).
Svaret är en utfallskod (`ok`, `no_entitlement`, `terms_not_accepted`,
`profile_incomplete`, `spot_not_found`, `case_already_open`, `images_invalid`,
`image_not_owned`, `image_not_found`, `note_too_long`), inte ett undantag;
ogiltiga symtomvärden faller på CHECK-villkoren.

Fotona (1–3, sorter översikt/närbild/skala; omtag senare) laddas upp av
klienten till `skin-photos/<uid>/…` före anropet och ligger i `review_images`
(`20260928200000`); `lesion_reviews.image_path` är huvudbilden (närbilden).
Varje ärende har minst ett foto -- en uppskjuten constraint-trigger
(`20260928203000`) stoppar committen annars, så klienten har en väg, inte två.
Bilddörren per foto är `request_review_image(image_id)`, samma regler som
`request_case_image`. Anamnesen fryses ur profilen i anropet (samma elva fält
och version som hud-koll). Symtomfrågorna har tre lägen (`ja`/`nej`/`vet_ej`,
NULL = obesvarat). Svarslöftet: avtalets arbetsdagar, annars 24 timmar alla
dagar (privatkund). Notisen `case_received` läggs i outboxen av triggern.

Bedömningen `submit_review_verdict(review, outcome, verdict, skin_type,
followup_weeks)` (`20260928201000`) skriver ett av fem utfall
(`dermatologist_outcome`: lag/mattlig/forhojd/needs_in_person; risknivån är
delmängden) och läkarens uppföljningstid för just det ärendet -- obligatorisk,
0 = ingen uppföljning, aktivt valt. `answer_insufficient_images(review, reasons)`
kräver orsaker ur listan i `retake_reasons`. Kontroll 34–40 i
`scripts/kolla-rls.sql` provar inskicket under riktiga roller; seedskriptet
ger Testbolaget ett avtal, admin-kontot ett betalt köp och båda ett
platshållarfoto i lagringen.

Lokal provkörning av migrationerna: hela kedjan går att spela upp i en vanlig
Postgres med ett litet Supabase-skal (`scripts/lokal-postgres-skal.sql`:
roller, `auth.uid()`, `storage.objects`); `20260812143321` är en dubblett av
`20260810142457` och `20260906230000` kräver pg_cron/pg_net -- båda hoppas
över lokalt.

## Ny kontroll (steg 3.3)

`/app/ny-kontroll`: fyra steg i helskärm -- plats på figuren, tre foton,
frågor, skicka -- i `src/routes/app/ny-kontroll.tsx` med ett steg per fil i
`src/kamera/`. Utkastet (plats, foton som blobbar, svar) sparas i IndexedDB
efter varje ändring (`utkast.ts`) och raderas när kvittot visas; ingenting
laddas upp förrän användaren skickar. Rätten, villkoren och profilen
kontrolleras när flödet öppnas (`checkReadiness`) och avgörs ändå i
databasen vid inskicket.

Kameran (`sokare.tsx`, `kamera.ts`) är en `getUserMedia`-ström med en ring och
två MÄTTA indikatorer, skärpa (Laplace-varians) och ljus (histogram), i
ringens område (`kvalitet.ts`, rena funktioner, enhetstestade). Avstånd mäts
inte -- ingen webbläsare lämnar ut fokusavståndet -- ringen och instruktionen
bär det. Indikatorerna mäter bilden, aldrig fläcken (regel 3), och spärrar
aldrig: "använd ändå" finns alltid, och `skickad_trots_varning` följer med i
`review_images.quality_flags`. Kameraappen (`<input capture>`) och galleriet
finns alltid som alternativ; alla vägar går genom samma mätning på den
färdiga bilden (`bild.ts`: längsta sida 1600 px, JPEG 0,82). Trösklarna
(`SKARPA_GRANS` 60, `MORK_GRANS` 50, `UTFRATT_ANDEL` 5 %) är startvärden;
sökaren visar råvärdena i dev-läge så att de kan justeras mot riktiga
telefoner.

Inskicket (`skicka.ts`) är en port (`Sender`) med `supabase-avsandare.ts`
som riktig avsändare: fläcken skapas om den är ny (namn efter kroppsdel,
löpnummer), fotona laddas upp till `skin-photos/<uid>/<uuid>.jpg` med ett
omförsök, sedan `submit_lesion_review()`. Kroppsvalet sparas på
`profiles.figure_variant` (`20260929090000`); alla fläckar bor i samma
kropps rymd. Symtomversionen fryses av RPC:n (`symptom_version`), aldrig av
klienten. Kontroll 41 i `kolla-rls.sql` provar kolumngranten.

Provkörning utan telefon: `scripts/prov-ny-kontroll.mjs` kör hela flödet i
headless Chromium med en falsk kamera (`scripts/falsk-kamera.py` gör
y4m-filerna: skarp, suddig, mörk) och Supabase fejkat vid nätverksgränsen.
Det skarpa provet är telefonen mot riktiga databasen: `/dev`-panelens
patient har avtal via Testbolaget.

## Ärendet och brevet (steg 3.4)

`/app/arenden` (en rad per fläck, senaste kontrollen, öppna först),
`/app/arende/$id` (en kontroll: brevet, instruktionerna för nya bilder eller
klockan överst; tidslinjen, fotona, patientens svar och tidigare kontroller
av samma fläck under) och `/app/flack/$id` (till fläckens senaste kontroll).
`/hem` och `/flack/$id` leder in i appen: det är adresserna mejlen från
`notisutskick` länkar till (hud-kolls vägar), så länkarna fungerar utan att
edge-funktionen ändras. Utloggad går vägen via `/logga-in?till=…`; både
kodvägen och dev-panelen följer `till` tillbaka.

Logiken är rena, testade funktioner i `src/arenden/`: `tidslinje.ts`,
`klocka.ts` och `datum.ts` (alltid svensk tid), `utfall.ts` (ord och piller;
den varma accenten för förhöjd, på plats och nya bilder), `brevtext.ts`,
`lista.ts`. `data.ts` läser under RLS med uttryckliga kolumnlistor -- aldrig
`*`, så AI-kolumnerna kan inte ens efterfrågas -- filtrerat på den inloggades
user_id, och signerar fotona i webbläsaren under "own folder read" (egna
visningar loggas inte). "Antagen" visas utan namn: `case_reviewer` lämnar ut
namnet först när ärendet är avslutat (20260906160000).

Brevet (`brev.tsx`, ritning v2 avsnitt 3): brevhuvud med ordmärket, läkarens
text ordagrant i Source Serif 4, utfallet och uppföljningen på egna rader,
namn och titel, "Så går du vidare" vid förhöjd risk och på plats, ren
utskrift (`print:`-varianter; bara brevet skrivs ut). Serifen hämtas med
brevet och förcachas (bara latin). Inget i brevet lovar det som inte finns:
följdfråga (3.5), episodknappar och påminnelse (3.6), remiss och recept
(4.2). Knappen för nya bilder i samma ärende kommer i 4.2.

Före granskarvyn besvaras testärenden med `scripts/besvara-testarende.sql`
(seed-dermatologen, riktiga funktioner, bara @skintel.test-konton; utfall,
text och veckor under ÄNDRA HÄR). `scripts/prov-arende.mjs` provar sidorna i
headless Chromium mot en fejkad PostgREST som vägrar `*` och `ai_`-kolumner.

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
