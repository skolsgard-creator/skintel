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

Kroppsfiguren (steg 3.1) mäts i ett bygge som behåller provsidan `/dev/figur`:

```bash
bun run build:prov && bun run preview   # öppna http://<datorns LAN-adress>:8080/dev/figur i mobilen
```

Kropparna genereras om ur MakeHumans basmodell (`assets/figur/makehuman/`) med
`python3 scripts/rita-figur.py` (pip install numpy scipy scikit-image trimesh fast-simplification).

Bildjämförelse av designsystemet (första gången: `bunx playwright install chromium`):

```bash
bun run shots        # skriver shots/*.png, förra körningen i shots/forra/
```

Läs `CLAUDE.md` innan du ändrar något: reglerna där är juridiska och
medicinska, inte stilfrågor.
