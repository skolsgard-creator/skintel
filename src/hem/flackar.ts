import type { SpotRow } from "@/arenden/lista";
import type { CaseSummary, SpotRef } from "@/arenden/typer";
import { caseTone } from "@/arenden/utfall";
import { regionByKey, type BodyMarker } from "@/figur/kontrakt";

// Fläckarna på Min hud: en prick per fläck som har en sparad plats på
// kroppen (spots.position_*: satt när fläcken valdes på figuren i Ny
// kontroll, eller på hud-kolls figur). Figuren lägger pricken på ytan inom
// fläckens region, så en punkt från en annan kropp eller en annan
// armställning hamnar på rätt kroppsdel. Fläckar med bara region och sida
// (seedens) ritas inte; de som har en kontroll finns under Ärenden och
// räknas så att sidan kan säga det.

/** En rad ur spots, med exakt de kolumner Min hud läser (data.ts). */
export type SpotRecord = {
  id: string;
  name: string;
  region_key: string | null;
  body_side: string | null;
  position_x: number | null;
  position_y: number | null;
  position_z: number | null;
  normal_x: number | null;
  normal_y: number | null;
  normal_z: number | null;
};

export type BodySpot = { spot: SpotRef; latest: CaseSummary | null; count: number };

/** Utan sparad normal pekar pricken framåt; figuren lägger den ändå på
 *  ytan och tar ytans normal där (traff.ts). */
const FORWARD = [0, 0, 1] as const;

export function bodySpots(
  spots: readonly SpotRecord[],
  rows: readonly SpotRow[],
  now: Date,
): { markers: BodyMarker[]; withoutPlace: number; byId: Map<string, BodySpot> } {
  const latestBySpot = new Map(rows.map((r) => [r.spot.id, r]));
  const markers: BodyMarker[] = [];
  const byId = new Map<string, BodySpot>();
  let withoutPlace = 0;

  for (const s of spots) {
    const row = latestBySpot.get(s.id);
    byId.set(s.id, { spot: { id: s.id, name: s.name }, latest: row?.latest ?? null, count: row?.count ?? 0 });
    if (s.position_x === null || s.position_y === null || s.position_z === null) {
      if (row) withoutPlace++;
      continue;
    }
    const hasNormal = s.normal_x !== null && s.normal_y !== null && s.normal_z !== null;
    markers.push({
      id: s.id,
      regionKey: regionByKey(s.region_key) ? s.region_key : null,
      tone: caseTone(row?.latest ?? null, now),
      position: [s.position_x, s.position_y, s.position_z],
      normal: hasNormal ? [s.normal_x!, s.normal_y!, s.normal_z!] : FORWARD,
    });
  }
  return { markers, withoutPlace, byId };
}

/** Raden under figuren när ingen prick är vald. Figuren vrids med fingret;
 *  vändknappen är bara en genväg. */
export function legendText(markers: number, withoutPlace: number): string {
  const parts: string[] = ["Dra för att vrida."];
  if (markers > 0) parts.push("Tryck på en prick för att se fläcken.");
  if (withoutPlace === 1) parts.push("En fläck utan plats finns under Ärenden.");
  if (withoutPlace > 1) parts.push(`${withoutPlace} fläckar utan plats finns under Ärenden.`);
  if (markers === 0 && withoutPlace === 0) parts.push("Fläckarna du kontrollerar visas här.");
  return parts.join(" ");
}
