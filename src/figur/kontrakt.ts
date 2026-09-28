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

export type BodyMarker = {
  id: string;
  position: Vec3;
  normal: Vec3;
};

export type FigureStats = {
  /** Millisekunder från att figuren började monteras till första ritade bilden. */
  firstFrameMs: number;
  triangles: number;
};

export type FigureHandle = {
  /** Byter kropp. Markeringar och val hör till en kropps rymd och rensas av anroparen. */
  setVariant(variant: FigureVariant): Promise<void>;
  setMarkers(markers: readonly BodyMarker[]): void;
  /** Den punkt användaren senast valt; ritas som en större markering. */
  setSelection(point: BodyPoint | null): void;
  /** Vrider figuren mot en region och ger regionens fokuspunkt (tillgänglig väg). */
  focus(regionKey: string, side: BodySide): BodyPoint | null;
  turn(face: "front" | "back"): void;
  destroy(): void;
};

export type FigureOptions = {
  variant: FigureVariant;
  onPick(point: BodyPoint): void;
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
