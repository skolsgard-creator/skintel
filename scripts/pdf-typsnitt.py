#!/usr/bin/env python3
"""Journalens typsnitt: statiska TTF-filer ur appens egna variabla typsnitt.

PDF:en (src/journal/pdf.ts) ska ha samma röst som appen -- Schibsted Grotesk
för allt och Source Serif 4 för brevet -- men jsPDF bäddar bara in statiska
TrueType-filer. Skriptet läser fontsource-paketen som appen redan har
(node_modules/@fontsource-variable/...), slår ihop teckenuppsättningarna
latin och latin-ext, låser vikten (och den optiska storleken för serifen,
11 pt som i brevet) och skriver fyra filer till src/journal/typsnitt/. jsPDF
bäddar sedan bara in de tecken som används.

Licensen (SIL Open Font License 1.1) följer med filerna, som paketens
LICENSE-filer.

    python3 scripts/pdf-typsnitt.py

Kräver fontTools och brotli (pip install fonttools brotli). Kör om när
fontsource-paketen uppdateras; utdata checkas in.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
NODE = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "src" / "journal" / "typsnitt"

GROTESK = NODE / "schibsted-grotesk" / "files" / "schibsted-grotesk-{subset}-wght-normal.woff2"
SERIF = NODE / "source-serif-4" / "files" / "source-serif-4-{subset}-opsz-normal.woff2"

JOBS = [
    (GROTESK, {"wght": 400}, "grotesk-400.ttf", ("Schibsted Grotesk", "Regular")),
    (GROTESK, {"wght": 600}, "grotesk-600.ttf", ("Schibsted Grotesk", "SemiBold")),
    (SERIF, {"wght": 400, "opsz": 11}, "serif-400.ttf", ("Source Serif 4", "Regular")),
    (SERIF, {"wght": 600, "opsz": 11}, "serif-600.ttf", ("Source Serif 4", "SemiBold")),
]


def static_instance(source: Path, location: dict[str, float], target: Path) -> None:
    font = TTFont(source)
    axes = {a.axisTag for a in font["fvar"].axes}
    pinned = {tag: value for tag, value in location.items() if tag in axes}
    static = instancer.instantiateVariableFont(font, pinned, updateFontNames=False)
    static.flavor = None
    static.save(target)


def rename(font: TTFont, family: str, style: str) -> None:
    """Namnen efter vikten, så att PDF-läsaren visar SemiBold som SemiBold."""
    full = f"{family} {style}"
    postscript = f"{family.replace(' ', '')}-{style}"
    names = {1: family, 2: style, 3: f"Skintel journal: {postscript}", 4: full, 6: postscript, 16: family, 17: style}
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names:
            table.removeNames(nameID=record.nameID)
    for name_id, value in names.items():
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for pattern, location, name, (family, style) in JOBS:
            parts = []
            for subset in ("latin", "latin-ext"):
                part = Path(tmp) / f"{subset}-{name}"
                static_instance(Path(str(pattern).format(subset=subset)), location, part)
                parts.append(str(part))
            merged = Merger().merge(parts)
            rename(merged, family, style)
            merged.save(OUT / name)
            print(f"{name}: {(OUT / name).stat().st_size // 1024} kB")
    shutil.copyfile(NODE / "schibsted-grotesk" / "LICENSE", OUT / "OFL-schibsted-grotesk.txt")
    shutil.copyfile(NODE / "source-serif-4" / "LICENSE", OUT / "OFL-source-serif-4.txt")


if __name__ == "__main__":
    main()
