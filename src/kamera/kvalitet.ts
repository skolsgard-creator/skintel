// Bildkvalitet, mätt -- aldrig tyckt. Rena funktioner på pixeldata, så att
// sökaren (levande), kameraappen och galleriet (efteråt) bedömer en bild på
// exakt samma sätt.
//
// Två mått, och bara två (design/skinvision-kameraflodet.md):
//   skärpa -- variansen av Laplace-operatorn i ringens område. Kanter ger
//             stora värden, oskärpa små.
//   ljus   -- medelvärde och andelar mörka/utfrätta pixlar i samma område.
// Ingen av dem säger något om VAD som finns i bilden (regel 3 och
// MDR-positionen: ingen "hittade fläck"). Avstånd går inte att mäta på
// webben; det är ringens storlek och instruktionen som bär det.
//
// Trösklarna är startvärden mätta på syntetiska bilder. Sökaren visar
// råvärdena i dev-läge så att de kan justeras mot riktiga telefoner.

export type Rect = { x: number; y: number; w: number; h: number };

export type Omdome = "bra" | "varning";

/** Varningarna delar ord med granskarens omtagsorsaker (retake_reasons)
 *  där de betyder samma sak. */
export type Kvalitetsvarning = "oskarp" | "for_morkt" | "for_ljust";

export type Kvalitet = {
  skarpa: { varde: number; omdome: Omdome };
  ljus: { varde: number; omdome: Omdome };
  varningar: Kvalitetsvarning[];
};

/** Under det här är bilden oskarp. Slät hud utan kanter hamnar också lågt,
 *  därför en varning och aldrig en spärr. */
export const SKARPA_GRANS = 60;
/** Medelluminans (0–255) under vilken bilden är för mörk. */
export const MORK_GRANS = 50;
/** Andel utfrätta pixlar (≥ 250) över vilken bilden är för ljus. */
export const UTFRATT_ANDEL = 0.05;
/** Medelluminans över vilken bilden är för ljus även utan utfrätning. */
export const LJUS_GRANS = 215;

/** RGBA → luminans (Rec. 601), en byte per pixel. */
export function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (rgba[j]! * 299 + rgba[j + 1]! * 587 + rgba[j + 2]! * 114 + 500) / 1000;
  }
  return out;
}

/** Variansen av 4-grannars Laplace-svar över områdets inre pixlar -- de
 *  vars alla fyra grannar också ligger i området, så att inget utanför
 *  ringen räknas. */
export function laplacianVariance(gray: Uint8Array, width: number, area: Rect): number {
  const x0 = Math.max(1, area.x + 1);
  const y0 = Math.max(1, area.y + 1);
  const x1 = Math.min(width - 1, area.x + area.w - 1);
  const y1 = Math.min(gray.length / width - 1, area.y + area.h - 1);
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      const i = row + x;
      const v = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      n++;
      sum += v;
      sumSq += v * v;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export type Exponering = {
  /** Medelluminans 0–255. */
  mean: number;
  /** Andel pixlar under 40. */
  darkShare: number;
  /** Andel pixlar från 250 och uppåt. */
  brightShare: number;
};

export function exposure(gray: Uint8Array, width: number, area: Rect): Exponering {
  const x0 = Math.max(0, area.x);
  const y0 = Math.max(0, area.y);
  const x1 = Math.min(width, area.x + area.w);
  const y1 = Math.min(gray.length / width, area.y + area.h);
  let n = 0;
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      const v = gray[row + x]!;
      n++;
      sum += v;
      if (v < 40) dark++;
      if (v >= 250) bright++;
    }
  }
  if (n === 0) return { mean: 0, darkShare: 0, brightShare: 0 };
  return { mean: sum / n, darkShare: dark / n, brightShare: bright / n };
}

/** Hela bedömningen av en bild (eller en sökarbild) inom ett område. */
export function assessQuality(rgba: Uint8ClampedArray, width: number, height: number, area: Rect): Kvalitet {
  const gray = toGray(rgba);
  const clipped: Rect = {
    x: Math.max(0, area.x),
    y: Math.max(0, area.y),
    w: Math.min(width, area.x + area.w) - Math.max(0, area.x),
    h: Math.min(height, area.y + area.h) - Math.max(0, area.y),
  };
  const skarpa = laplacianVariance(gray, width, clipped);
  const ljus = exposure(gray, width, clipped);
  const varningar: Kvalitetsvarning[] = [];
  if (skarpa < SKARPA_GRANS) varningar.push("oskarp");
  if (ljus.mean < MORK_GRANS) varningar.push("for_morkt");
  else if (ljus.brightShare > UTFRATT_ANDEL || ljus.mean > LJUS_GRANS) varningar.push("for_ljust");
  return {
    skarpa: { varde: Math.round(skarpa), omdome: varningar.includes("oskarp") ? "varning" : "bra" },
    ljus: {
      varde: Math.round(ljus.mean),
      omdome: varningar.includes("for_morkt") || varningar.includes("for_ljust") ? "varning" : "bra",
    },
    varningar,
  };
}
