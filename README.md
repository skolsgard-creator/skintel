# Skintel

Den nya sajten på skintel.se. Mobile-first, installerbar som PWA, mot samma
Supabase-databas som förut. Ritning och beslut finns i Claude-projektet Skintel
(`produkt/ritning-v2-ny-hemsida.md`).

## Kom igång

```bash
bun install
bun run dev          # http://localhost:8080 -- öppna datorns LAN-adress i mobilen
```

Databasen:

```bash
npx supabase link --project-ref npaktlkeqsugckubccbn
npx supabase db push                                     # nya migrationer
npx supabase db query --linked -f scripts/kolla-rls.sql  # behörighetskontrollerna
```

Läs `CLAUDE.md` innan du ändrar något: reglerna där är juridiska och
medicinska, inte stilfrågor.
