#!/usr/bin/env python3
"""Gör kroppsfigurerna (steg 3.1) av MakeHumans basmodell: kompakta mesh med regioner.

Källan är MakeHumans basmodell och makrotargets (CC0, `assets/figur/makehuman/`).
Ur samma topologi görs tre varianter -- neutral, kvinna, man -- genom att
basmodellen morfas med MakeHumans egna "young"-targets (gender 0.5 / 0 / 1,
lika delar av de tre etniska targets, som MakeHuman gör som standard).
Modellen skalas till 1,93 enheter med fötterna på y = 0, armarna fälls från
~43° till ~22° kring axelleden, kroppen förenklas till ett budgetvänligt
antal trianglar och varje hörn får en kroppsregion ur ett kapselskelett som
byggs av modellens egna ledmarkörer (joint-*-grupperna i basmodellen) med
radier uppmätta ur ytan. Därför bär varje punkt på ytan sin region från
början -- inget gissas i klienten, och alla tre varianter delar regler.

Koordinater: y uppåt, fötterna på y = 0, hjässan = 1.93, z+ = framsidan,
x+ = figurens vänstra sida (betraktarens högra). Samma konvention som
`spots.position_*` i databasen och som hud-koll använde.

Körs från repots rot:

    python3 scripts/rita-figur.py                               # skriver filerna nedan
    python3 scripts/rita-figur.py --forhandsvisning ut.png      # även en snabb bild (neutral)

Kräver numpy, scipy, scikit-image, trimesh och fast-simplification
(pip install numpy scipy scikit-image trimesh fast-simplification).
Skriver:

    public/figur/figur-{neutral,kvinna,man}.bin   hörn (int16), trianglar (uint16), region per hörn (uint8)
    src/figur/figur-data.ts                       regionlista; per variant fokuspunkter och siluett
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ROT = Path(__file__).resolve().parent.parent
MH = ROT / "assets/figur/makehuman"
UT_DIR = ROT / "public/figur"
TS = ROT / "src/figur/figur-data.ts"

HOJD = 1.93
VARIANTER: dict[str, float] = {"neutral": 0.5, "kvinna": 0.0, "man": 1.0}  # MakeHumans gender-värde
ETIKETT = {"neutral": "Neutral", "kvinna": "Kvinna", "man": "Man"}
ETNISKA = ("african", "asian", "caucasian")
ARMVINKEL_GRADER = 22.0  # från lodlinjen, efter fällningen

# --------------------------------------------------------------------------
# Regioner -- samma nycklar som hud-koll och databasen.
# --------------------------------------------------------------------------

REGIONER: list[tuple[str, str, bool]] = [
    # (nyckel, etikett, parig)
    ("ansikte", "Ansikte", False),
    ("huvud", "Huvud", False),
    ("hals", "Hals", False),
    ("nacke", "Nacke", False),
    ("nyckelben", "Nyckelben", True),
    ("axel", "Axel", True),
    ("overarm", "Överarm", True),
    ("armbage", "Armbåge", True),
    ("underarm", "Underarm", True),
    ("handled", "Handled", True),
    ("hand", "Hand", True),
    ("brost", "Bröst", True),
    ("revben", "Revben och sida", True),
    ("mage", "Mage", False),
    ("ljumske", "Ljumske", False),
    ("rygg_ovre", "Övre rygg", False),
    ("rygg_mellan", "Mellanrygg", False),
    ("rygg_nedre", "Nedre rygg", False),
    ("sate", "Säte", True),
    ("hoft", "Höft", True),
    ("lar", "Lår", True),
    ("kna", "Knä", True),
    ("knaveck", "Knäveck", True),
    ("underben", "Underben", True),
    ("fotled", "Fotled", True),
    ("fot", "Fot", True),
]
REGION_ID = {nyckel: i for i, (nyckel, _, _) in enumerate(REGIONER)}

# --------------------------------------------------------------------------
# Basmodellen
# --------------------------------------------------------------------------


@dataclass
class Basmodell:
    verts: np.ndarray  # alla hörn, även hjälpgeometri (targets pekar på dem)
    kropp_faces: np.ndarray  # fyrkanter i gruppen body, index i verts
    grupper: dict[str, list[list[int]]] = field(default_factory=dict)


def las_basmodell() -> Basmodell:
    verts: list[list[float]] = []
    grupper: dict[str, list[list[int]]] = {}
    grupp = "body"
    with open(MH / "base.obj", encoding="utf-8") as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("g "):
                grupp = line.split()[1]
                grupper.setdefault(grupp, [])
            elif line.startswith("f "):
                grupper[grupp].append([int(p.split("/")[0]) - 1 for p in line.split()[1:]])
    return Basmodell(np.array(verts), np.array(grupper["body"]), grupper)


def las_target(namn: str) -> np.ndarray:
    """Ett MakeHuman-target: rader 'index dx dy dz'. Returneras som (index, dx, dy, dz)."""
    rader = []
    with gzip.open(MH / "targets" / f"{namn}.target.gz", "rt", encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) == 4:
                rader.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
    return np.array(rader, dtype=np.float64)


def morfa(bas: Basmodell, gender: float) -> np.ndarray:
    """MakeHumans makrosystem för en ung vuxen med medelmuskler och medelvikt:
    de tre etniska targets i lika delar, viktade med kön. De 'universal'-targets
    som hör till medel/medel är tomma, så de behövs inte."""
    v = bas.verts.copy()
    for etn in ETNISKA:
        for kon, vikt in (("female", 1.0 - gender), ("male", gender)):
            if vikt <= 0:
                continue
            t = las_target(f"{etn}-{kon}-young")
            idx = t[:, 0].astype(np.int64)
            v[idx] += (vikt / len(ETNISKA)) * t[:, 1:4]
    return v


def led(bas: Basmodell, verts: np.ndarray, namn: str) -> np.ndarray:
    """Ledens läge: tyngdpunkten av hjälpkuben joint-<namn>."""
    idx = sorted({i for f in bas.grupper[f"joint-{namn}"] for i in f})
    return verts[idx].mean(axis=0)


def avstand_till_polylinje(p: np.ndarray, punkter: list[np.ndarray]) -> np.ndarray:
    d = np.full(len(p), np.inf)
    for a, b in zip(punkter[:-1], punkter[1:]):
        ab = b - a
        t = np.clip(((p - a) @ ab) / float(ab @ ab), 0.0, 1.0)
        d = np.minimum(d, np.linalg.norm(p - (a + t[:, None] * ab[None, :]), axis=1))
    return d


def smoothstep(t: np.ndarray) -> np.ndarray:
    c = np.clip(t, 0.0, 1.0)
    return c * c * (3 - 2 * c)


def fall_armar(bas: Basmodell, verts: np.ndarray) -> np.ndarray:
    """Vrider armarna ner mot ARMVINKEL_GRADER kring axelleden, med mjuk
    övertoning från leden så att axeln hänger ihop med bålen. Hjälpkuberna
    (lederna) följer med, så skelettet mäts i den slutliga posen.
    Enheter: MakeHumans (decimeter)."""
    v = verts.copy()
    for sida, prefix in ((1.0, "l"), (-1.0, "r")):
        axel = led(bas, verts, f"{prefix}-shoulder")
        armbage = led(bas, verts, f"{prefix}-elbow")
        hand = led(bas, verts, f"{prefix}-hand")
        finger = led(bas, verts, f"{prefix}-finger-3-4")
        nu = math.atan2(sida * (hand[0] - axel[0]), axel[1] - hand[1])
        vridning = nu - math.radians(ARMVINKEL_GRADER)
        if vridning <= 0:
            continue
        x, y = v[:, 0], v[:, 1]
        # Armen: allt utanför bålens sida som ligger nära armens egen axel
        # (axel -> armbåge -> hand -> fingertopp, förlängd en bit).
        spets = finger + (finger - hand) / (np.linalg.norm(finger - hand) + 1e-9) * 1.0
        mask = (sida * x >= 0.88 * abs(axel[0])) & (y <= axel[1] + 0.25)
        mask &= avstand_till_polylinje(v, [axel, armbage, hand, spets]) < 1.4
        rx = x[mask] - axel[0]
        ry = y[mask] - axel[1]
        vikt = smoothstep(np.hypot(rx, ry) / 1.2)
        theta = -sida * vridning * vikt
        c, s = np.cos(theta), np.sin(theta)
        v[mask, 0] = axel[0] + rx * c - ry * s
        v[mask, 1] = axel[1] + rx * s + ry * c
    return v


def skala_till_box(verts: np.ndarray, kropp_idx: np.ndarray) -> np.ndarray:
    """Fötterna på y = 0, hjässan på HOJD, bålen på x = 0. Skalar allt (även lederna)."""
    k = verts[kropp_idx]
    v = verts - np.array([0.0, k[:, 1].min(), 0.0])
    v = v * (HOJD / (k[:, 1].max() - k[:, 1].min()))
    v[:, 0] -= (v[kropp_idx, 0].max() + v[kropp_idx, 0].min()) / 2
    return v


# --------------------------------------------------------------------------
# Skelettet: kapslar mellan leder, radier uppmätta ur ytan
# --------------------------------------------------------------------------

Delar = list[tuple[float, str]]  # (andel längs kapseln där delen slutar, region)


@dataclass
class Kapsel:
    a: np.ndarray
    b: np.ndarray
    r0: float
    r1: float
    fram: Delar
    bak: Delar | None = None
    sida: Delar | None = None
    vikt: float = 0.0


def _del(delar: Delar, t: float) -> str:
    for till, nyckel in delar:
        if t <= till:
            return nyckel
    return delar[-1][1]


def mat_radie(verts: np.ndarray, a: np.ndarray, b: np.ndarray, tak: float, kvantil: float = 0.7) -> float:
    """Radien för en kapsel: kvantilen av avståndet till axeln bland hörn som
    projicerar på kapselns mitt och ligger inom `tak`."""
    ab = b - a
    l2 = float(ab @ ab)
    t = np.clip(((verts - a) @ ab) / l2, 0.0, 1.0) if l2 > 1e-12 else np.zeros(len(verts))
    d = np.linalg.norm(verts - (a + t[:, None] * ab[None, :]), axis=1)
    inne = ((t > 0.2) & (t < 0.8) & (d < tak)) if l2 > 1e-12 else (d < tak)
    if not inne.any():
        return tak / 2
    return float(np.quantile(d[inne], kvantil))


def bygg_skelett(bas: Basmodell, alla: np.ndarray, kropp: np.ndarray) -> list[Kapsel]:
    """Kapslar mellan modellens leder, radier ur ytan. Samma regler för alla varianter."""
    ut: list[Kapsel] = []

    def L(namn: str) -> np.ndarray:
        return led(bas, alla, namn)

    def kapsel(a, b, tak, fram, bak=None, sida=None, r=None, vikt=0.0):
        rr = r if r is not None else mat_radie(kropp, np.asarray(a, float), np.asarray(b, float), tak)
        ut.append(Kapsel(np.asarray(a, float), np.asarray(b, float), rr, rr, fram, bak, sida, vikt))

    huvud, hjassa, hals, kake = L("head"), L("head-2"), L("neck"), L("jaw")
    # Huvud: från käken upp till hjässan. Hals: från halsroten till käken.
    kapsel(kake + (huvud - kake) * 0.4, hjassa, 0.2, [(1, "ansikte")], bak=[(1, "huvud")])
    kapsel(hals, kake + np.array([0.0, -0.01, -0.03]), 0.12, [(1, "hals")], bak=[(1, "nacke")])

    lax, rax = L("l-shoulder"), L("r-shoulder")
    # Axelvalsen över nyckelbenen, och deltoiderna.
    kapsel(rax, lax, 0.12, [(1, "nyckelben")], bak=[(1, "rygg_ovre")], sida=[(1, "axel")])
    for ax in (lax, rax):
        kapsel(ax, ax, 0.12, [(1, "axel")], r=0.075, vikt=0.012)

    # Bålen: från axelhöjd ner till grenen, en kapsel med olika gränser fram, bak och på sidan.
    topp = np.array([0.0, (lax[1] + rax[1]) / 2, (lax[2] + rax[2]) / 2 - 0.02])
    lben, rben = L("l-upper-leg"), L("r-upper-leg")
    gren = np.array([0.0, min(lben[1], rben[1]) - 0.02, (lben[2] + rben[2]) / 2 - 0.02])
    kapsel(
        topp,
        gren,
        0.3,
        fram=[(0.06, "nyckelben"), (0.42, "brost"), (0.76, "mage"), (1, "ljumske")],
        bak=[(0.33, "rygg_ovre"), (0.6, "rygg_mellan"), (0.8, "rygg_nedre"), (1, "sate")],
        sida=[(0.06, "axel"), (0.68, "revben"), (1, "hoft")],
    )

    for p in ("l", "r"):
        ax, arm, hand, finger = L(f"{p}-shoulder"), L(f"{p}-elbow"), L(f"{p}-hand"), L(f"{p}-finger-3-4")
        kapsel(ax, arm, 0.12, [(0.14, "axel"), (0.86, "overarm"), (1, "armbage")])
        kapsel(arm, hand, 0.1, [(0.14, "armbage"), (0.85, "underarm"), (1, "handled")])
        kapsel(hand, finger, 0.1, [(0.12, "handled"), (1, "hand")])
        hoft, kna, fotled, ta = L(f"{p}-upper-leg"), L(f"{p}-knee"), L(f"{p}-ankle"), L(f"{p}-toe-3-4")
        kapsel(
            hoft, kna, 0.16,
            [(0.12, "hoft"), (0.87, "lar"), (1, "kna")],
            bak=[(0.12, "sate"), (0.87, "lar"), (1, "knaveck")],
        )
        kapsel(
            kna, fotled, 0.12,
            [(0.1, "kna"), (0.9, "underben"), (1, "fotled")],
            bak=[(0.1, "knaveck"), (0.9, "underben"), (1, "fotled")],
        )
        kapsel(fotled, ta, 0.1, [(0.2, "fotled"), (1, "fot")])
    return ut


FRAM_GRANS = 0.42  # nz över detta = framsida, under -0.42 = baksida, annars sida


def klassificera(skelett: list[Kapsel], verts: np.ndarray, normaler: np.ndarray) -> np.ndarray:
    """Region per hörn: närmaste kapselyta i skelettet, sedan fram/bak/sida ur normalen."""
    n = len(verts)
    basta = np.full(n, np.inf)
    basta_i = np.zeros(n, dtype=np.int64)
    basta_t = np.zeros(n)
    for i, k in enumerate(skelett):
        ab = k.b - k.a
        l2 = float(ab @ ab)
        t = np.clip(((verts - k.a) @ ab) / l2, 0.0, 1.0) if l2 > 1e-12 else np.zeros(n)
        d = np.linalg.norm(verts - (k.a + t[:, None] * ab[None, :]), axis=1)
        r = k.r0 + (k.r1 - k.r0) * t
        poang = d - r + k.vikt
        battre = poang < basta
        basta[battre] = poang[battre]
        basta_i[battre] = i
        basta_t[battre] = t[battre]
    regioner = np.zeros(n, dtype=np.uint8)
    for j in range(n):
        k = skelett[basta_i[j]]
        nx, ny, nz = normaler[j]
        t = float(basta_t[j])
        nx_ut = nx if verts[j, 0] >= 0 else -nx  # utåt från kroppens mitt
        # Sidoregionen (revben, höft, axel) tar ytor som vetter utåt utan att
        # vetta framåt eller bakåt, samt allt som vetter uppåt (axlarnas översida).
        if k.sida is not None and (ny > 0.6 or (abs(nz) < FRAM_GRANS and abs(nx_ut) > 0.5)):
            nyckel = _del(k.sida, t)
        elif k.bak is not None and nz < 0:
            nyckel = _del(k.bak, t)
        else:
            nyckel = _del(k.fram, t)
        regioner[j] = REGION_ID[nyckel]
    return regioner


# --------------------------------------------------------------------------
# Mesh: förenkling, fokuspunkter, siluett
# --------------------------------------------------------------------------


def forenkla(verts: np.ndarray, faces: np.ndarray, mal_trianglar: int):
    import fast_simplification
    import trimesh

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    andel = max(0.0, 1.0 - mal_trianglar / len(mesh.faces))
    v2, f2 = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.int64), target_reduction=andel, agg=5
    )
    ut = trimesh.Trimesh(vertices=v2.astype(np.float64), faces=f2.astype(np.int64), process=True)
    if ut.volume < 0:
        ut.invert()
    return ut


def fokuspunkter(verts: np.ndarray, normaler: np.ndarray, regioner: np.ndarray) -> dict:
    """Per region (och sida för pariga): en punkt på ytan och en normal att titta in längs."""
    ut: dict[str, dict[str, dict]] = {}
    for nyckel, _, parig in REGIONER:
        mask = regioner == REGION_ID[nyckel]
        if not mask.any():
            print(f"varning: regionen {nyckel} fick inga hörn", file=sys.stderr)
            continue
        grupper: dict[str, np.ndarray] = {}
        if parig:
            for sida, villkor in (("vanster", verts[:, 0] > 0), ("hoger", verts[:, 0] < 0)):
                m = mask & villkor
                if m.any():
                    grupper[sida] = m
        else:
            grupper["mitten"] = mask
        ut[nyckel] = {}
        for sida, m in grupper.items():
            idx = np.flatnonzero(m)
            # Helst framifrån: regioner som syns från båda håll (armar, ben)
            # fokuseras från framsidan; en ryggregion har inga sådana hörn
            # och fokuseras då bakifrån.
            framat = idx[normaler[idx, 2] > 0.1]
            if len(framat) >= 0.3 * len(idx):
                idx = framat
            n_medel = normaler[idx].mean(axis=0)
            n_medel /= np.linalg.norm(n_medel) + 1e-9
            c = verts[idx].mean(axis=0)
            riktade = idx[(normaler[idx] @ n_medel) > 0.5]
            if len(riktade) == 0:
                riktade = idx
            j = riktade[np.argmin(np.linalg.norm(verts[riktade] - c, axis=1))]
            ut[nyckel][sida] = {
                "p": [round(float(v), 4) for v in verts[j]],
                "n": [round(float(v), 3) for v in n_medel],
            }
    return ut


def siluett(verts: np.ndarray, faces: np.ndarray, px_per_enhet: int = 400) -> tuple[str, list[float]]:
    from scipy import ndimage
    from skimage import measure
    from skimage.draw import polygon

    x = verts[:, 0]
    y = verts[:, 1]
    x0, x1 = x.min() - 0.02, x.max() + 0.02
    y0, y1 = y.min() - 0.02, y.max() + 0.02
    b = int((x1 - x0) * px_per_enhet) + 1
    h = int((y1 - y0) * px_per_enhet) + 1
    mask = np.zeros((h, b), dtype=bool)
    kol = (x - x0) * px_per_enhet
    rad = (y1 - y) * px_per_enhet
    for f in faces:
        rr, cc = polygon(rad[f], kol[f], mask.shape)
        mask[rr, cc] = True
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    konturer = measure.find_contours(mask.astype(float), 0.5)
    konturer.sort(key=lambda c: -len(c))
    delar = []
    for c in konturer:
        if len(c) < 40:
            continue
        c = measure.approximate_polygon(c, tolerance=1.2)
        punkter = [(x0 + col / px_per_enhet, y1 - row / px_per_enhet) for row, col in c]
        delar.append("M" + " L".join(f"{px:.3f} {py:.3f}" for px, py in punkter) + " Z")
    return " ".join(delar), [round(float(v), 3) for v in (x0, y0, x1, y1)]


# --------------------------------------------------------------------------
# Utdata
# --------------------------------------------------------------------------

SKALA = 1.0 / 10000.0  # int16-steg: 0,1 mm


def skriv_bin(sokvag: Path, verts: np.ndarray, faces: np.ndarray, regioner: np.ndarray) -> int:
    assert len(verts) < 65536, "för många hörn för uint16-index"
    q = np.round(verts / SKALA).astype(np.int16)
    sokvag.parent.mkdir(parents=True, exist_ok=True)
    with open(sokvag, "wb") as f:
        f.write(b"SKF1")
        f.write(struct.pack("<IIf", len(verts), len(faces), SKALA))
        f.write(q.astype("<i2").tobytes())
        f.write(faces.astype("<u2").tobytes())
        f.write(regioner.astype("u1").tobytes())
    return sokvag.stat().st_size


def skriv_ts(varianter: dict[str, dict]) -> None:
    TS.parent.mkdir(parents=True, exist_ok=True)
    regioner = ",\n".join(
        f'  {{ key: "{nyckel}", label: "{etikett}", paired: {"true" if parig else "false"} }}'
        for nyckel, etikett, parig in REGIONER
    )
    rader = []
    for namn, d in varianter.items():
        fokus = json.dumps(d["fokus"], ensure_ascii=False, separators=(",", ":"))
        rader.append(
            f"  {namn}: {{\n"
            f'    label: "{d["etikett"]}",\n'
            f'    url: "/figur/figur-{namn}.bin",\n'
            f"    focus: {fokus},\n"
            f'    silhouettePath: "{d["siluett"]}",\n'
            f"    silhouetteBox: {json.dumps(d['ruta'])},\n"
            f"    stats: {{ vertices: {d['horn']}, triangles: {d['trianglar']} }},\n"
            f"  }}"
        )
    variant_typ = " | ".join(f'"{n}"' for n in varianter)
    figurer = ",\n".join(rader)
    TS.write_text(
        f"""// Genererad av scripts/rita-figur.py -- redigera inte för hand.
// Regionnycklarna är desamma som i databasen (spots.region_key).

export type BodySide = "vanster" | "hoger" | "mitten";

export type BodyRegion = {{ key: string; label: string; paired: boolean }};

/** Ordningen är region-id i figur-*.bin. */
export const BODY_REGIONS: readonly BodyRegion[] = [
{regioner},
];

export type FocusPoint = {{ p: [number, number, number]; n: [number, number, number] }};

export type FigureVariant = {variant_typ};

export type FigureData = {{
  label: string;
  url: string;
  /** Punkt på ytan och riktning att titta in längs, per region och sida. */
  focus: Readonly<Record<string, Partial<Record<BodySide, FocusPoint>>>>;
  /** Siluetten framifrån, i kroppsenheter (y uppåt). */
  silhouettePath: string;
  silhouetteBox: readonly [number, number, number, number];
  stats: {{ vertices: number; triangles: number }};
}};

export const FIGURES: Readonly<Record<FigureVariant, FigureData>> = {{
{figurer},
}};

export const FIGURE_HEIGHT = {HOJD};
""",
        encoding="utf-8",
    )


def forhandsvisning(mesh, regioner: np.ndarray, ut: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    rng = np.random.default_rng(3)
    farger = rng.uniform(0.3, 0.95, size=(len(REGIONER), 3))
    fig = plt.figure(figsize=(15, 10), dpi=100)
    tri = mesh.vertices[mesh.faces]
    n = mesh.face_normals
    ljus = np.array([0.4, 0.7, 0.6])
    ljus /= np.linalg.norm(ljus)
    skugga = np.clip(n @ ljus, 0, 1) * 0.6 + 0.4
    reg = regioner[mesh.faces[:, 0]]
    for i, (azim, titel) in enumerate([(-90, "fram"), (-45, "snett"), (90, "bak")]):
        ax = fig.add_subplot(1, 3, i + 1, projection="3d")
        pc = Poly3DCollection(
            [[(vx, -vz, vy) for vx, vy, vz in t] for t in tri],
            facecolors=farger[reg] * skugga[:, None],
            edgecolors="none",
        )
        ax.add_collection3d(pc)
        ax.set_xlim(-0.5, 0.5)
        ax.set_ylim(-0.5, 0.5)
        ax.set_zlim(0, 2.0)
        ax.set_box_aspect((1.0, 1.0, 2.0), zoom=1.3)
        ax.view_init(elev=0, azim=azim)
        ax.set_axis_off()
        ax.set_title(titel)
    fig.tight_layout()
    fig.savefig(ut)


def bygg_variant(bas: Basmodell, namn: str, mal_trianglar: int):
    alla = morfa(bas, VARIANTER[namn])
    alla = fall_armar(bas, alla)
    kropp_idx = np.unique(bas.kropp_faces)
    alla = skala_till_box(alla, kropp_idx)

    # Kroppen som eget mesh (indexen packas om), förenklad.
    ny_index = -np.ones(len(alla), dtype=np.int64)
    ny_index[kropp_idx] = np.arange(len(kropp_idx))
    faces_q = ny_index[bas.kropp_faces]
    faces = np.concatenate([faces_q[:, [0, 1, 2]], faces_q[:, [0, 2, 3]]])
    mesh = forenkla(alla[kropp_idx], faces, mal_trianglar)
    verts = np.asarray(mesh.vertices)
    normaler = np.asarray(mesh.vertex_normals)

    skelett = bygg_skelett(bas, alla, verts)
    regioner = klassificera(skelett, verts, normaler)
    return mesh, regioner, {
        "etikett": ETIKETT[namn],
        "fokus": fokuspunkter(verts, normaler, regioner),
        "horn": len(verts),
        "trianglar": len(mesh.faces),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--forhandsvisning", type=Path, default=None)
    ap.add_argument("--trianglar", type=int, default=12000)
    ap.add_argument("--varianter", nargs="*", default=list(VARIANTER))
    args = ap.parse_args()

    bas = las_basmodell()
    ut: dict[str, dict] = {}
    for namn in args.varianter:
        mesh, regioner, d = bygg_variant(bas, namn, args.trianglar)
        verts = np.asarray(mesh.vertices)
        faces = np.asarray(mesh.faces)
        d["siluett"], d["ruta"] = siluett(verts, faces)
        storlek = skriv_bin(UT_DIR / f"figur-{namn}.bin", verts, faces, regioner)
        ut[namn] = d
        bredd = verts[:, 0].max() - verts[:, 0].min()
        print(f"{namn}: hörn {len(verts)}, trianglar {len(faces)}, figur-{namn}.bin {storlek} byte, bredd {bredd:.3f}")
        tomma = [nyckel for nyckel, _, _ in REGIONER if not (regioner == REGION_ID[nyckel]).any()]
        if tomma:
            print("  tomma regioner:", tomma, file=sys.stderr)
        if args.forhandsvisning and namn == args.varianter[0]:
            forhandsvisning(mesh, regioner, args.forhandsvisning)
            print("  förhandsvisning:", args.forhandsvisning)
    if set(args.varianter) == set(VARIANTER):
        skriv_ts(ut)
    else:
        print("(figur-data.ts skrivs bara när alla varianter byggs)")


if __name__ == "__main__":
    main()
