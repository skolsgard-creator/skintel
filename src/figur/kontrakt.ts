import { BODY_REGIONS, FIGURES, type BodyRegion, type BodySide, type FigureVariant } from "./figur-data";

// Kontraktet mellan kroppsfiguren och resten av appen (ritning v2, avsnitt 6):
// figuren -- 3D eller 2D-karta -- ger en region, en sida, en punkt och en
// normal, och tar emot markeringar i samma form. Ingenting annat i appen vet
// hur figuren ritas.

export type { BodyRegion, BodySide, FigureVariant };

/** Figurvarianterna i den ordning de visas. */
export const FIGURE_VARIANTS = Object.keys(FIGURES) as FigureVariant[];

export type Vec3 = readonly [number, number, number];

/** En plats på kroppen, som databasen lagrar den (spots.region_key, body_side,
 *  position_*, normal_*). */
export type BodyPoint = {
  regionKey: string;
  side: BodySide;
  /** Fullständig svensk beskrivning: "Vänster underarm", "Mage". */
  label: string;
  position: Vec3;
  normal: Vec3;
};

/** En prick på figuren. Positionen är den sparade; figuren lägger pricken
 *  på närmaste punkt på den kropp som visas, inom prickens region
 *  (traff.ts), så en fläck som sparades när en annan kropp var vald -- eller
 *  på hud-kolls figur -- ändå hamnar på huden, på rätt kroppsdel. Utan
 *  känd region (null) räknas hela kroppen. */
export type BodyMarker = {
  id: string;
  regionKey: string | null;
  /** Prickens färg: blågrön, eller bärnsten när något väntar på patienten
   *  (caseTone i src/arenden/utfall.ts). */
  tone: "primary" | "amber";
  position: Vec3;
  normal: Vec3;
};

/** Ett kort tryck på figuren: på en prick, på kroppen, eller bredvid den. */
export type FigureHit = { kind: "marker"; id: string } | { kind: "body"; point: BodyPoint } | { kind: "none" };

export type FigureStats = {
  /** Millisekunder från att figuren började monteras till första ritade bilden. */
  firstFrameMs: number;
  triangles: number;
};

export type FigureHandle = {
  /** Byter kropp. Prickarna läggs om på den nya kroppens yta; valet rensas. */
  setVariant(variant: FigureVariant): Promise<void>;
  setMarkers(markers: readonly BodyMarker[]): void;
  /** Den punkt användaren senast valt; ritas som en större markering. */
  setSelection(point: BodyPoint | null): void;
  /** Vrider figuren mot en region och ger regionens fokuspunkt (tillgänglig väg). */
  focus(regionKey: string, side: BodySide): BodyPoint | null;
  turn(face: "front" | "back"): void;
  /** Vilken sida kameran visar just nu -- också efter att användaren vridit. */
  facing(): "front" | "back";
  destroy(): void;
};

export type FigureOptions = {
  variant: FigureVariant;
  onPick(hit: FigureHit): void;
  onReady?(stats: FigureStats): void;
  /** Bildfrekvens under rörelse, ungefär en gång per halvsekund. */
  onFps?(fps: number): void;
};

export function regionByKey(key: string | null | undefined): BodyRegion | null {
  return BODY_REGIONS.find((r) => r.key === key) ?? null;
}

const SIDE_LABEL: Record<BodySide, string> = { vanster: "vänster", hoger: "höger", mitten: "" };

/** "Höger underarm", "Mage". Sidan nämns bara för pariga regioner. */
export function placementLabel(regionKey: string, side: BodySide): string {
  const region = regionByKey(regionKey);
  if (!region) return "Kroppen";
  const sideText = region.paired && side !== "mitten" ? SIDE_LABEL[side] : "";
  if (!sideText) return region.label;
  return `${sideText[0]!.toUpperCase()}${sideText.slice(1)} ${region.label.toLowerCase()}`;
}

/** Sidan ur x i figurens rymd: x+ är figurens vänstra sida (betraktarens högra). */
export function sideFor(x: number): BodySide {
  if (x < -0.024) return "hoger";
  if (x > 0.024) return "vanster";
  return "mitten";
}

/** Sidor som finns att välja för en region i den tillgängliga listan. */
export function sidesFor(region: BodyRegion): readonly BodySide[] {
  return region.paired ? ["vanster", "hoger"] : ["mitten"];
}
