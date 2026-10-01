// Vad ett foto är, ur filens egna byte: format, storlek i pixlar och
// EXIF-orientering. Journalen bäddar in JPEG och PNG som de är -- ingen
// omkodning, ingen kvalitetsförlust. Appens egna foton är redan JPEG utan
// orientering (bild.ts ritar om dem innan uppladdningen), men äldre foton
// från hud-koll kan vara något annat, och en PDF följer aldrig
// EXIF-orienteringen: ett sådant foto ritas om i webbläsaren först.

export type ImageInfo = {
  format: "jpeg" | "png";
  width: number;
  height: number;
  orientation: number;
};

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function u16(b: Uint8Array, i: number, little = false): number {
  return little ? b[i]! | (b[i + 1]! << 8) : (b[i]! << 8) | b[i + 1]!;
}

function u32(b: Uint8Array, i: number, little = false): number {
  return little
    ? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0
    : ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
}

/** Orienteringen ur ett APP1-segment med EXIF, annars 1. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  const isExif = [0x45, 0x78, 0x69, 0x66, 0, 0].every((c, k) => b[start + k] === c);
  if (!isExif) return 1;
  const tiff = start + 6;
  if (tiff + 8 > end) return 1;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return 1;
  const ifd = tiff + u32(b, tiff + 4, little);
  if (ifd + 2 > end) return 1;
  const count = u16(b, ifd, little);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return 1;
    if (u16(b, entry, little) === 0x0112) return u16(b, entry + 8, little);
  }
  return 1;
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // utfyllnad
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // bilddata utan storlek före
    const length = u16(b, i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > b.length) return null;
    if (marker === 0xe1) orientation = exifOrientation(b, i + 4, end);
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      return { format: "jpeg", height: u16(b, i + 5), width: u16(b, i + 7), orientation };
    }
    i = end;
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegInfo(b);
  const isPng = b.length >= 24 && PNG_SIGNATURE.every((c, k) => b[k] === c);
  if (isPng && String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) === "IHDR") {
    return { format: "png", width: u32(b, 16), height: u32(b, 20), orientation: 1 };
  }
  return null;
}

/** Måste fotot ritas om i webbläsaren innan det kan bäddas in? */
export function needsReencode(info: ImageInfo | null): boolean {
  return info === null || info.orientation !== 1;
}
