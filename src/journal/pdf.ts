import { PRICK, WORDMARK_D, WORDMARK_VIEWBOX } from "@/components/brand/logo-paths";
import { layout, type ColorKey, type FontKey, type Op } from "./layout";
import { svgPathOps } from "./svgvag";
import type { JournalDoc } from "./typer";

// Journalen ritad med jsPDF. Sättningen (layout.ts) bestämmer var allt
// står; här mäts texten i de riktiga typsnitten och sidorna ritas. jsPDF
// hämtas först när någon tar fram en journal -- den ingår inte i appens
// första nedladdning och inte i förcachen.
//
// Fotona bäddas in som de är (JPEG passerar orörd, PNG packas om
// förlustfritt) i den storlek sättningen gett dem: journalen är en kopia,
// och en kopia ska inte vara sämre än originalet. Typsnitten är appens egna
// (scripts/pdf-typsnitt.py); jsPDF bäddar bara in de tecken som används.
// Ett tecken som saknas i typsnittet (en emoji i patientens notering) ritas
// inte, men stoppar ingenting.

export type PhotoData = {
  bytes: Uint8Array;
  format: "jpeg" | "png";
  width: number;
  height: number;
};

/** Typsnittsfilerna som base64, nycklade som i sättningen. */
export type FontFiles = Record<FontKey, string>;

// Appens färger (src/styles/app.css, ljust läge) i sRGB.
const COLORS: Record<ColorKey | "primary", string> = {
  ink: "#0f1d1e",
  muted: "#516162",
  rule: "#dfdcd5",
  primary: "#195553",
};

/** Namnen PDF-läsaren visar, samma som i typsnittsfilerna. */
const FONT_NAMES: Record<FontKey, string> = {
  sans: "SchibstedGrotesk-Regular",
  sansBold: "SchibstedGrotesk-SemiBold",
  serif: "SourceSerif4-Regular",
  serifBold: "SourceSerif4-SemiBold",
};

export async function renderPdf(
  doc: JournalDoc,
  photos: Map<string, PhotoData>,
  fonts: FontFiles,
  createdAt: Date = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  for (const key of Object.keys(FONT_NAMES) as FontKey[]) {
    pdf.addFileToVFS(`${FONT_NAMES[key]}.ttf`, fonts[key]);
    pdf.addFont(`${FONT_NAMES[key]}.ttf`, FONT_NAMES[key], "normal");
  }
  pdf.setProperties({
    title: doc.title,
    subject: "Journal",
    author: "Skintel",
    creator: "Skintel",
  });
  pdf.setCreationDate(createdAt);
  pdf.setLanguage("sv");

  const measure = (text: string, font: FontKey, size: number) => {
    pdf.setFont(FONT_NAMES[font], "normal");
    pdf.setFontSize(size);
    return pdf.getTextWidth(text);
  };
  const sizes = new Map([...photos].map(([key, p]) => [key, { width: p.width, height: p.height }]));
  const pages = layout(doc, measure, sizes);

  pages.forEach((ops, index) => {
    if (index > 0) pdf.addPage();
    for (const op of ops) draw(pdf, op, photos);
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}

type Pdf = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

function draw(pdf: Pdf, op: Op, photos: Map<string, PhotoData>): void {
  switch (op.op) {
    case "text":
      pdf.setFont(FONT_NAMES[op.font], "normal");
      pdf.setFontSize(op.size);
      pdf.setTextColor(COLORS[op.color]);
      pdf.text(op.text, op.x, op.y, op.align ? { align: op.align } : undefined);
      return;
    case "line":
      pdf.setDrawColor(COLORS[op.color]);
      pdf.setLineWidth(op.width);
      pdf.line(op.x1, op.y1, op.x2, op.y2);
      return;
    case "image": {
      const photo = photos.get(op.key);
      if (!photo) throw new Error(`renderPdf: fotot ${op.key} saknas`);
      pdf.addImage(
        photo.bytes,
        photo.format === "jpeg" ? "JPEG" : "PNG",
        op.x,
        op.y,
        op.w,
        op.h,
        op.key,
      );
      return;
    }
    case "logo":
      drawWordmark(pdf, op.x, op.y, op.h);
      return;
  }
}

/** Ordmärket ur samma konturer som på skärmen: bokstäverna i textfärgen,
 *  i-pricken med sin ring i primärfärgen. */
function drawWordmark(pdf: Pdf, x: number, y: number, h: number): void {
  const [minX, minY, , height] = WORDMARK_VIEWBOX.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const scale = h / height;
  const map = (vx: number, vy: number): [number, number] => [
    x + (vx - minX) * scale,
    y + (vy - minY) * scale,
  ];

  pdf.setFillColor(COLORS.ink);
  pdf.path(svgPathOps(WORDMARK_D, map));
  pdf.fill();

  const [cx, cy] = map(PRICK.cx, PRICK.cy);
  const ring = (PRICK.r / 6) * scale;
  pdf.setDrawColor(COLORS.primary);
  pdf.setLineWidth(ring);
  pdf.circle(cx, cy, PRICK.r * scale - ring / 2, "S");
  pdf.setFillColor(COLORS.primary);
  pdf.circle(cx, cy, PRICK.r * 0.46 * scale, "F");
}
