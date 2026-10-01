import type { Block, JournalDoc, Row, TextStyle } from "./typer";

// Sättningen: journalens block på A4-sidor, som ritoperationer med mått i
// millimeter. Ren och utan jsPDF -- mätningen av text kommer utifrån -- så
// att radbrytning och sidbrytning går att testa för hand.
//
// Reglerna: en rubrik står aldrig ensam längst ner (den följer med sin
// första rad), en fotorad delas aldrig, en tabellrad delas bara när den är
// högre än en hel sida, och ingen sida blir tom. Sidfoten med "Sida N av M"
// läggs på sist, när antalet sidor är känt.

export type FontKey = "sans" | "sansBold" | "serif" | "serifBold";
export type ColorKey = "ink" | "muted" | "rule";

/** Textens bredd i mm, i ett visst typsnitt och en viss storlek (pt). */
export type Measure = (text: string, font: FontKey, sizePt: number) => number;

export type Op =
  | {
      op: "text";
      x: number;
      y: number;
      text: string;
      font: FontKey;
      size: number;
      color: ColorKey;
      align?: "right";
    }
  | { op: "image"; key: string; x: number; y: number; w: number; h: number }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; color: ColorKey; width: number }
  | { op: "logo"; x: number; y: number; h: number };

export const PAGE = {
  width: 210,
  height: 297,
  left: 20,
  right: 190,
  top: 20,
  /** Lägsta baslinje för innehållet. */
  bottom: 274,
  /** Sidfotens baslinje. */
  footerY: 285,
  contentWidth: 170,
  labelWidth: 50,
  /** Vänsterspalten när etiketterna är frågor (svaren, hälsouppgifterna). */
  wideLabelWidth: 95,
  gutter: 4,
  photoWidth: 82,
  photoHeight: 70,
  photoGap: 6,
  logoHeight: 6.5,
} as const;

const PT = 0.3528; // mm per punkt

type Style = {
  font: FontKey;
  size: number;
  lh: number;
  color: ColorKey;
  before: number;
  after: number;
};

const STYLES: Record<
  TextStyle | "title" | "subtitle" | "h1" | "h2" | "h3" | "label" | "value" | "caption" | "footer",
  Style
> = {
  title: { font: "sansBold", size: 22, lh: 1.2, color: "ink", before: 5, after: 0.5 },
  subtitle: { font: "sans", size: 9, lh: 1.4, color: "muted", before: 0, after: 6 },
  h1: { font: "sansBold", size: 16, lh: 1.25, color: "ink", before: 2, after: 2 },
  h2: { font: "sansBold", size: 12.5, lh: 1.3, color: "ink", before: 7, after: 1 },
  h3: { font: "sansBold", size: 10, lh: 1.4, color: "ink", before: 5, after: 1.5 },
  body: { font: "sans", size: 10, lh: 1.45, color: "ink", before: 0, after: 1.5 },
  small: { font: "sans", size: 8.5, lh: 1.4, color: "muted", before: 0, after: 1.5 },
  strong: { font: "sansBold", size: 10, lh: 1.45, color: "ink", before: 1.5, after: 0.5 },
  letter: { font: "serif", size: 11, lh: 1.5, color: "ink", before: 0, after: 2.5 },
  letterStrong: { font: "serifBold", size: 11, lh: 1.5, color: "ink", before: 0, after: 2.5 },
  label: { font: "sans", size: 8.5, lh: 1.4, color: "muted", before: 0, after: 0 },
  value: { font: "sans", size: 10, lh: 1.45, color: "ink", before: 0, after: 0 },
  caption: { font: "sans", size: 8, lh: 1.35, color: "muted", before: 0, after: 0 },
  footer: { font: "sans", size: 8, lh: 1.35, color: "muted", before: 0, after: 0 },
};

const ROW_GAP = 1.8;
const PHOTO_CAPTION_GAP = 1.8;
const PHOTO_ROW_GAP = 5;

const lineHeight = (s: Style) => s.size * PT * s.lh;
/** Baslinjen i en rad: versalhöjden mitt i radens höjd. */
const baseline = (s: Style) => (lineHeight(s) + s.size * PT * 0.7) / 2;

/** Bryter en text till rader inom en bredd: vid ordgränser, och inne i ord
 *  som är längre än raden. En radbrytning i texten står kvar. */
export function wrap(text: string, width: number, s: Style, measure: Measure): string[] {
  const fits = (t: string) => measure(t, s.font, s.size) <= width + 1e-6;
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = "";
      while (!fits(word)) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut--;
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    }
    out.push(line);
  }
  return out;
}

type Size = { width: number; height: number };

function fitPhoto(size: Size): { w: number; h: number } {
  const scale = Math.min(PAGE.photoWidth / size.width, PAGE.photoHeight / size.height);
  return { w: size.width * scale, h: size.height * scale };
}

export function layout(doc: JournalDoc, measure: Measure, photoSizes: Map<string, Size>): Op[][] {
  const pages: Op[][] = [[]];
  let y = PAGE.top;
  let atTop = true;
  const page = () => pages[pages.length - 1]!;
  const newPage = () => {
    pages.push([]);
    y = PAGE.top;
    atTop = true;
  };
  /** Ser till att en höjd får plats; annars ny sida. */
  const ensure = (height: number) => {
    if (!atTop && y + height > PAGE.bottom) newPage();
  };
  const spaceBefore = (mm: number) => {
    if (!atTop) y += mm;
  };
  const placeLine = (text: string, x: number, s: Style, align?: "right") => {
    page().push({
      op: "text",
      x,
      y: y + baseline(s),
      text,
      font: s.font,
      size: s.size,
      color: s.color,
      ...(align ? { align } : {}),
    });
    y += lineHeight(s);
    atTop = false;
  };

  /** Vänsterspaltens bredd för ett block: den vanliga, eller den breda när
   *  någon etikett inte ryms -- frågor med korta svar. */
  const labelWidthFor = (rows: Row[]) =>
    rows.some((r) => measure(r.label, STYLES.label.font, STYLES.label.size) > PAGE.labelWidth)
      ? PAGE.wideLabelWidth
      : PAGE.labelWidth;

  const rowLines = (row: Row, labelWidth: number) => ({
    label: wrap(row.label, labelWidth, STYLES.label, measure),
    value: row.value
      ? wrap(row.value, PAGE.right - (PAGE.left + labelWidth + PAGE.gutter), STYLES.value, measure)
      : [],
  });
  const rowHeight = (lines: { label: string[]; value: string[] }) =>
    Math.max(
      lines.label.length * lineHeight(STYLES.label),
      lines.value.length * lineHeight(STYLES.value),
    );

  const photoRows = (photos: { key: string; caption: string }[]) => {
    const rows: { key: string; caption: string[]; w: number; h: number }[][] = [];
    for (let i = 0; i < photos.length; i += 2) {
      rows.push(
        photos.slice(i, i + 2).map((p) => {
          const size = photoSizes.get(p.key);
          if (!size) throw new Error(`layout: fotot ${p.key} saknar storlek`);
          return {
            key: p.key,
            caption: wrap(p.caption, PAGE.photoWidth, STYLES.caption, measure),
            ...fitPhoto(size),
          };
        }),
      );
    }
    return rows;
  };
  const photoRowHeight = (row: { caption: string[]; h: number }[]) =>
    Math.max(
      ...row.map((p) => p.h + PHOTO_CAPTION_GAP + p.caption.length * lineHeight(STYLES.caption)),
    );

  /** Höjden på blockets första del: det en rubrik ska få plats med. */
  const firstUnit = (b: Block | undefined): number => {
    if (!b) return 0;
    switch (b.t) {
      case "text": {
        const s = STYLES[b.style];
        return s.before + lineHeight(s);
      }
      case "rows":
        return b.rows[0] ? rowHeight(rowLines(b.rows[0], labelWidthFor(b.rows))) : 0;
      case "photos":
        return b.photos.length ? photoRowHeight(photoRows(b.photos.slice(0, 2))[0]!) : 0;
      case "heading":
        return STYLES[`h${b.level}`].before + lineHeight(STYLES[`h${b.level}`]);
      default:
        return 0;
    }
  };

  const textBlock = (text: string, s: Style) => {
    spaceBefore(s.before);
    for (const line of wrap(text, PAGE.contentWidth, s, measure)) {
      ensure(lineHeight(s));
      placeLine(line, PAGE.left, s);
    }
    y += s.after;
  };

  doc.blocks.forEach((block, index) => {
    switch (block.t) {
      case "masthead": {
        ensure(PAGE.logoHeight + 20);
        page().push({ op: "logo", x: PAGE.left, y, h: PAGE.logoHeight });
        y += PAGE.logoHeight;
        atTop = false;
        textBlock(block.title, STYLES.title);
        textBlock(block.subtitle, STYLES.subtitle);
        break;
      }
      case "heading": {
        const s = STYLES[`h${block.level}`];
        const lines = wrap(block.text, PAGE.contentWidth, s, measure);
        ensure(
          s.before + lines.length * lineHeight(s) + s.after + firstUnit(doc.blocks[index + 1]),
        );
        spaceBefore(s.before);
        for (const line of lines) placeLine(line, PAGE.left, s);
        y += s.after;
        break;
      }
      case "text":
        textBlock(block.text, STYLES[block.style]);
        break;
      case "rows": {
        spaceBefore(1);
        const labelWidth = labelWidthFor(block.rows);
        const valueX = PAGE.left + labelWidth + PAGE.gutter;
        for (const row of block.rows) {
          const lines = rowLines(row, labelWidth);
          const height = rowHeight(lines);
          if (height <= PAGE.bottom - PAGE.top) ensure(height);
          const n = Math.max(lines.label.length, lines.value.length);
          // Vänster och höger delar baslinje; en rad som är högre än en hel
          // sida fortsätter rad för rad på nästa.
          for (let k = 0; k < n; k++) {
            ensure(lineHeight(STYLES.value));
            const top = y;
            if (lines.label[k] !== undefined) {
              page().push({
                op: "text",
                x: PAGE.left,
                y: top + baseline(STYLES.value),
                text: lines.label[k]!,
                font: STYLES.label.font,
                size: STYLES.label.size,
                color: STYLES.label.color,
              });
            }
            if (lines.value[k] !== undefined) {
              page().push({
                op: "text",
                x: valueX,
                y: top + baseline(STYLES.value),
                text: lines.value[k]!,
                font: STYLES.value.font,
                size: STYLES.value.size,
                color: STYLES.value.color,
              });
            }
            y = top + lineHeight(STYLES.value);
            atTop = false;
          }
          y += ROW_GAP;
        }
        y += 1;
        break;
      }
      case "photos": {
        spaceBefore(1);
        for (const row of photoRows(block.photos)) {
          ensure(photoRowHeight(row));
          const top = y;
          row.forEach((p, i) => {
            const x = PAGE.left + i * (PAGE.photoWidth + PAGE.photoGap);
            page().push({ op: "image", key: p.key, x, y: top, w: p.w, h: p.h });
            let cy = top + p.h + PHOTO_CAPTION_GAP;
            for (const line of p.caption) {
              page().push({
                op: "text",
                x,
                y: cy + baseline(STYLES.caption),
                text: line,
                font: STYLES.caption.font,
                size: STYLES.caption.size,
                color: STYLES.caption.color,
              });
              cy += lineHeight(STYLES.caption);
            }
          });
          y = top + photoRowHeight(row) + PHOTO_ROW_GAP;
          atTop = false;
        }
        break;
      }
      case "rule": {
        if (atTop) break;
        ensure(8);
        y += 3;
        page().push({
          op: "line",
          x1: PAGE.left,
          y1: y,
          x2: PAGE.right,
          y2: y,
          color: "rule",
          width: 0.25,
        });
        y += 4;
        break;
      }
      case "pagebreak":
        if (!atTop) newPage();
        break;
    }
  });

  const total = pages.length;
  pages.forEach((ops, i) => {
    const s = STYLES.footer;
    ops.push(
      {
        op: "line",
        x1: PAGE.left,
        y1: PAGE.footerY - 4.5,
        x2: PAGE.right,
        y2: PAGE.footerY - 4.5,
        color: "rule",
        width: 0.2,
      },
      {
        op: "text",
        x: PAGE.left,
        y: PAGE.footerY,
        text: doc.footer,
        font: s.font,
        size: s.size,
        color: s.color,
      },
      {
        op: "text",
        x: PAGE.right,
        y: PAGE.footerY,
        text: `Sida ${i + 1} av ${total}`,
        font: s.font,
        size: s.size,
        color: s.color,
        align: "right",
      },
    );
  });
  return pages;
}
