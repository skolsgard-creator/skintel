# Applicerade migrationer

*Ärvd från `hud-koll` 2026-09-28. `docs/…`-hänvisningarna nedan pekar på filer som ligger kvar där.*

**Historiken hålls numera av Supabase CLI:n, inte av den här filen.** Sedan flytten till
det egna projektet `npaktlkeqsugckubccbn` (2026-08-30) körs migrationerna med
`supabase db push`, och `supabase migration list --linked` är den auktoritativa källan
till vad som är applicerat. Kör den frågan i stället för att lita på en handskriven rad.

```bash
supabase migration list --linked
```

Filen behålls för sin historik och för verifieringsanteckningarna nedan, som säger något
`migration list` inte gör: *vad* som kontrollerades efter en körning, inte bara att den skedde.

<details><summary>Varför filen fanns, och varför den premissen inte längre gäller</summary>

Mot Lovable Cloud (`khcmlsqwbutxwnxylfkr`) körde Lovable bara migrationer den själv skapade.
Filer som kom in via git synkades till repot men kördes aldrig mot databasen — de klistrades
in för hand i SQL-editorn. En migrationsfil i `supabase/migrations/` sa därför **ingenting**
om huruvida den var applicerad, och databasen gick inte att nå från utvecklingsmiljön.
Den här filen var då enda källan.

Båda de förutsättningarna är borta: projektet ägs nu av oss, CLI:n är länkad mot det, och
`supabase db query --linked` når databasen direkt.

</details>

Raderna nedan gäller det **gamla** projektet (`khcmlsqwbutxwnxylfkr`) om inget annat anges.
Samtliga 27 migrationer kördes om från noll mot `npaktlkeqsugckubccbn` 2026-08-30 —
se `docs/flytt-till-eget-supabase.md` och avsnittet om dubbletten `20260812143321` i CLAUDE.md.

| Migration | Körd | Verifierat |
|---|---|---|
| `20260829135112` — notification_preferences + lås på profiles.email | 2026-08-29 | `profiles` har bara `SELECT` på tabellnivå, 19 kolumner för `INSERT` och `UPDATE`. |
| `20260829142829` — lås utlåtandet och anamnesen | 2026-08-29 | Policyerna heter `own scans read`, `own spots read`, `own spots insert`. `scans` har bara `SELECT`, `spots` har `INSERT` och `SELECT`. `lesion_reviews_spot_id_fkey` har `confdeltype = 'r'`. `anamnesis` (jsonb) och `anamnesis_version` (text) finns. Ärende inskickat 2026-08-29 14:45 i preview har `anamnesis` ifylld med version `2026-08-19`. |
| `20260829204945` — avtal, avtalsdokument, avtalsinställningar | 2026-08-29 (gamla projektet, ostyrkt) · 2026-08-30 (nya, styrkt) | Mot `npaktlkeqsugckubccbn`: `contract_settings`, `organization_agreements` och `agreement_documents` finns, RLS på alla tre, noll grants till `anon`/`authenticated`. Bucketen `agreements` finns med `public = false`. |

Äldre migrationer: se `20260825150013`, som kör de tre filer som låg okörda i
repot fram till dess. Allt före den är applicerat av Lovable självt.

## Verifiering efter flytten (2026-08-30, `npaktlkeqsugckubccbn`)

Kört mot det nya projektet efter `db push`. Frågorna går att köra om:

```bash
# 18 tabeller, RLS på varje, antal policyer per tabell
supabase db query --linked "
  SELECT c.relname, c.relrowsecurity,
         (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1;"

# Buckets, rollfunktioner och grants till anon/authenticated
supabase db query --linked "SELECT id, public FROM storage.buckets;"

# Supabases egna säkerhetsråd
supabase db advisors --linked
```

Utfall: 18 tabeller, RLS påslaget på samtliga. Sju av dem har noll policyer
(`agreement_documents`, `contract_settings`, `image_access_log`,
`notification_preferences`, `one_time_purchases`, `organization_agreements`,
`subscriptions`) — det är avsiktligt, RLS utan policy nekar allt och de nås bara via
service-role-klienten. Alla sex `SECURITY DEFINER`-funktioner finns. `db advisors` ger noll
fel, bara prestandavarningar (`auth_rls_initplan`, `multiple_permissive_policies`).

`skin-photos` skapas för hand och ingår inte i migrationerna — se steg 4 i
`docs/flytt-till-eget-supabase.md`.
