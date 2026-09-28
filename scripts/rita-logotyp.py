#!/usr/bin/env python3
"""Ritar Skintels logotyp som konturer (SVG) och appikoner (PNG).

Koncept A "Pricken" (ritning v2, avsnitt 3; valt 28 sep 2026): ordmärket
skintel i gemener, satt i Schibsted Grotesk 600, där i-pricken är fläcken --
en fylld punkt med en tunn ring runt, i primärfärgen. Märket ensamt är
punkten med ringen.

Körs från repots rot:

    python3 scripts/rita-logotyp.py

Kräver fonttools, brotli och uharfbuzz (pip install fonttools brotli uharfbuzz)
samt Pillow. Läser typsnittet ur node_modules (kör bun install först).
Skriver:

    public/logo/skintel.svg          ordmärke, text i bläck, prick i primär
    public/logo/skintel-negativ.svg  ordmärke i papper, för mörk botten
    public/logo/marke.svg            märket ensamt, primär
    public/favicon.svg               märket ensamt
    public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
    src/components/brand/logo-paths.ts   konturerna för React-komponenten

Färgerna är tokens ur src/styles/app.css, omräknade till hex.
"""

from __future__ import annotations

import io
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw

ROT = Path(__file__).resolve().parent.parent
FONT = ROT / "node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2"
UT = ROT / "public"

# Tokens (app.css) i hex -- se oklch-omräkningen i byggdagboken 28 sep.
INK = "#0f1d1e"  # foreground oklch(22% 0.02 200)
PRIMARY = "#195553"  # primary oklch(41% 0.06 192)
PAPER = "#fbf8f3"  # background oklch(98% 0.008 80)

WEIGHT = 600
TEXT = "skıntel"  # ı (U+0131) -- pricken ritas separat
TRACKING = -0.02  # em, samma som i komponenten


def ladda_font() -> tuple[TTFont, bytes]:
    vf = TTFont(str(FONT))
    inst = instantiateVariableFont(vf, {"wght": WEIGHT}, inplace=False)
    buf = io.BytesIO()
    inst.flavor = None
    inst.save(buf)
    return inst, buf.getvalue()


def forma(fontdata: bytes, text: str, upm: int):
    """Låter HarfBuzz sätta texten: glyfindex och position per tecken."""
    face = hb.Face(fontdata)
    font = hb.Font(face)
    font.scale = (upm, upm)
    hb.ot_font_set_funcs(font)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    return list(zip(buf.glyph_infos, buf.glyph_positions))


def ordmarke_paths(font: TTFont, fontdata: bytes) -> tuple[list[tuple[str, float]], float, dict]:
    upm = font["head"].unitsPerEm
    glyf = font.getGlyphSet()
    order = font.getGlyphOrder()
    tracking = TRACKING * upm
    x = 0.0
    paths: list[tuple[str, float]] = []
    for info, pos in forma(fontdata, TEXT, upm):
        name = order[info.codepoint]
        pen = SVGPathPen(glyf, ntos=lambda v: f"{v:.0f}")
        # Typsnittets y pekar uppåt; SVG:s nedåt.
        tpen = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset))
        glyf[name].draw(tpen)
        d = pen.getCommands()
        if d:
            paths.append((d, x))
        x += pos.x_advance + tracking
    bredd = x - tracking
    os2 = font["OS/2"]
    metrik = {
        "upm": upm,
        "xHeight": getattr(os2, "sxHeight", None) or upm * 0.5,
        "capHeight": getattr(os2, "sCapHeight", None) or upm * 0.7,
        "ascender": font["hhea"].ascent,
        "descender": font["hhea"].descent,
    }
    return paths, bredd, metrik


def hitta_i(font: TTFont, fontdata: bytes) -> float:
    """Mittpunkten i x-led för ı, oavsett vad glyfen heter i just det här typsnittet."""
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    i_gid = font.getGlyphID(cmap[0x0131])
    tracking = TRACKING * upm
    x = 0.0
    for info, pos in forma(fontdata, TEXT, upm):
        if info.codepoint == i_gid:
            return x + pos.x_offset + pos.x_advance / 2
        x += pos.x_advance + tracking
    raise SystemExit("hittade inte ı i texten")


def marke_svg(cx: float, cy: float, r: float, farg: str) -> str:
    """Pricken med ringen. r = ringens yttre radie; ringens tjocklek 1/6 av r, punkten 0.46 r."""
    ring = r / 6
    return (
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r - ring / 2:.1f}" fill="none" stroke="{farg}" stroke-width="{ring:.1f}"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r * 0.46:.1f}" fill="{farg}"/>'
    )


def skriv_ordmarke(font: TTFont, fontdata: bytes) -> None:
    paths, bredd, m = ordmarke_paths(font, fontdata)
    upm = m["upm"]
    i_x = hitta_i(font, fontdata)
    x_h = m["xHeight"]
    # Ringens storlek och läge: yttre radie 0.165 em, underkant 0.045 em över x-höjden.
    r = 0.165 * upm
    gap = 0.045 * upm
    cy = -(x_h + gap + r)  # SVG-y (nedåt), baslinjen är y = 0
    topp = min(cy - r, -m["ascender"])
    botten = -m["descender"]
    marg = 0.08 * upm
    vb_x, vb_y = -marg, topp - marg
    vb_w, vb_h = bredd + 2 * marg, (botten - topp) + 2 * marg

    def svg(text_farg: str, prick_farg: str) -> str:
        d = " ".join(p for p, _ in paths)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}" '
            f'role="img" aria-label="skintel">'
            f'<title>skintel</title>'
            f'<path fill="{text_farg}" fill-rule="nonzero" d="{d}"/>'
            f"{marke_svg(i_x, cy, r, prick_farg)}"
            f"</svg>\n"
        )

    (UT / "logo").mkdir(parents=True, exist_ok=True)
    (UT / "logo/skintel.svg").write_text(svg(INK, PRIMARY))
    (UT / "logo/skintel-negativ.svg").write_text(svg(PAPER, PAPER))
    # Samma konturer som React-komponenten i src/components/brand/logo.tsx läser.
    d = " ".join(p for p, _ in paths)
    (ROT / "src/components/brand/logo-paths.ts").write_text(
        "// Genererad av scripts/rita-logotyp.py -- redigera inte för hand.\n"
        "// Ordmärket skintel i Schibsted Grotesk 600 som konturer, plus prickens läge.\n"
        f'export const WORDMARK_VIEWBOX = "{vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}";\n'
        f"export const WORDMARK_RATIO = {vb_w / vb_h:.4f}; // bredd/höjd\n"
        f'export const WORDMARK_D =\n  "{d}";\n'
        f"export const PRICK = {{ cx: {i_x:.0f}, cy: {cy:.0f}, r: {r:.0f} }};\n"
    )
    print(f"ordmärke: {len(paths)} glyfer, bredd {bredd / upm:.2f} em, x-höjd {x_h / upm:.3f} em, prick vid x={i_x / upm:.3f} em")


def skriv_marke() -> None:
    # Märket ensamt i en 64-ruta: ring yttre radie 24, tjocklek 4, punkt 11.
    inner = '<circle cx="32" cy="32" r="22" fill="none" stroke="{f}" stroke-width="4"/><circle cx="32" cy="32" r="11" fill="{f}"/>'
    (UT / "logo/marke.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Skintel"><title>Skintel</title>{inner.format(f=PRIMARY)}</svg>\n'
    )
    (UT / "favicon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{inner.format(f=PRIMARY)}</svg>\n'
    )


def ikon(storlek: int, *, maskable: bool, hornradie: float | None) -> Image.Image:
    """Primär botten, märket i papper. Ritas i 4x och skalas ner för kantutjämning."""
    s = storlek * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if hornradie is None:
        d.rectangle((0, 0, s, s), fill=PRIMARY)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=hornradie * 4, fill=PRIMARY)
    # Maskable: allt viktigt inom den inre 80 %-cirkeln. Märket får radien 0.26 av sidan.
    cx = cy = s / 2
    r = s * (0.24 if maskable else 0.30)
    ring = r / 6
    d.ellipse((cx - r + ring / 2, cy - r + ring / 2, cx + r - ring / 2, cy + r - ring / 2), outline=PAPER, width=int(ring))
    rp = r * 0.46
    d.ellipse((cx - rp, cy - rp, cx + rp, cy + rp), fill=PAPER)
    return im.resize((storlek, storlek), Image.LANCZOS)


def skriv_ikoner() -> None:
    ikon(192, maskable=False, hornradie=None).save(UT / "icon-192.png")
    ikon(512, maskable=False, hornradie=None).save(UT / "icon-512.png")
    ikon(512, maskable=True, hornradie=None).save(UT / "icon-maskable-512.png")
    ikon(180, maskable=False, hornradie=None).save(UT / "apple-touch-icon.png")
    print("ikoner: 192, 512, maskable 512, apple-touch 180")


if __name__ == "__main__":
    font, data = ladda_font()
    skriv_ordmarke(font, data)
    skriv_marke()
    skriv_ikoner()
