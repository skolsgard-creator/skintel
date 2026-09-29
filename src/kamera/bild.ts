import { assessQuality, type Kvalitet, type Rect } from "./kvalitet";

// Bilden mellan kameran och lagringen: nedskalning, rotation och den
// kvalitetsmätning som görs på den färdiga bilden. Måtten är hud-kolls
// (src/lib/image.ts där): ett telefonfoto på 3–5 MB blir 300–500 kB, långt
// över vad ett öga på en skärm kan skilja på, och mobildata räcker.

/** Längsta sida i pixlar efter nedskalning. */
export const MAX_EDGE = 1600;
/** JPEG-kvalitet: under 0,82 börjar artefakter synas i hudtoner. */
export const JPEG_QUALITY = 0.82;
/** Ringens andel av bildens kortsida -- samma i sökaren och i mätningen. */
export const RING_ANDEL = 0.56;

/** Storleken efter nedskalning. Skalar aldrig upp. */
export function targetSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Ringens område: en centrerad kvadrat med sidan `andel` av kortsidan. */
export function ringArea(width: number, height: number, andel: number): Rect {
  const side = Math.round(Math.min(width, height) * andel);
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), w: side, h: side };
}

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  kvalitet: Kvalitet;
};

/** Bredden bilden mäts i: mindre än så och kanter försvinner, mer och
 *  mätningen tar för lång tid i sökaren. */
const MAT_BREDD = 320;

/**
 * Nedskalad JPEG av en bild från kameraappen eller galleriet, med
 * kvalitetsmätning i ringens område. EXIF-rotationen följer med genom
 * `imageOrientation: "from-image"`, så bilden ritas åt rätt håll.
 */
export async function prepareImage(source: Blob): Promise<PreparedImage> {
  const decoded = await decode(source);
  try {
    const { width, height } = targetSize(decoded.width, decoded.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Bilden kunde inte bearbetas.");
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("Bilden kunde inte bearbetas.");
    return { blob, width, height, kvalitet: measureCanvas(canvas) };
  } finally {
    decoded.release();
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release(): void };

/** createImageBitmap där det finns (snabbt, utanför huvudtråden), annars
 *  ett <img>-element -- båda ritar bilden åt rätt håll enligt EXIF. */
async function decode(source: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Faller tillbaka på <img> nedan (äldre Safari, eller ett format bitmap-vägen inte tar).
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Bilden kunde inte läsas."));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Kvalitetsmätning av det som ligger på en canvas (färdig bild eller en
 *  sökarbild): skalas till mätbredden, ringens område bedöms. */
export function measureCanvas(source: HTMLCanvasElement | HTMLVideoElement): Kvalitet {
  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const { width, height } = targetSize(srcW, srcH, MAT_BREDD);
  const canvas = matCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Bilden kunde inte mätas.");
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return assessQuality(data, width, height, ringArea(width, height, RING_ANDEL));
}

let cached: HTMLCanvasElement | null = null;
function matCanvas(width: number, height: number): HTMLCanvasElement {
  if (!cached) cached = document.createElement("canvas");
  if (cached.width !== width) cached.width = width;
  if (cached.height !== height) cached.height = height;
  return cached;
}
