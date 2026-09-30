import type { Vec3 } from "./kontrakt";

// Två rena funktioner som figuren (3D eller 2D) använder för sina prickar:
// vilken prick ett tryck träffar, och var på kroppens yta en sparad punkt
// hamnar. Ingen three.js här -- funktionerna tar tal och ger tal, så att de
// går att testa och att en 2D-karta kan använda samma regler.

export type ProjectedMarker = { id: string; x: number; y: number };

/**
 * Pricken ett tryck träffar: den närmaste inom `radiusPx` (skärmpixlar) som
 * dessutom syns. Synligheten prövas i avståndsordning och bara för prickar
 * inom radien -- den kan kosta en stråle genom kroppen per prick.
 */
export function nearestMarker(
  markers: readonly ProjectedMarker[],
  tap: { x: number; y: number },
  radiusPx: number,
  isVisible: (id: string) => boolean,
): string | null {
  const r2 = radiusPx * radiusPx;
  const within = markers
    .map((m) => ({ id: m.id, d2: (m.x - tap.x) ** 2 + (m.y - tap.y) ** 2 }))
    .filter((m) => m.d2 <= r2)
    .sort((a, b) => a.d2 - b.d2);
  for (const m of within) {
    if (isVisible(m.id)) return m.id;
  }
  return null;
}

/**
 * Närmaste punkt på meshets yta och den triangelns normal. En fläck sparas
 * i den kropp som visades då; visas en annan kropp läggs pricken här, så att
 * den alltid ligger på huden. Rakt genom alla trianglar -- figuren har
 * 12 000, och det görs en gång per prick när prickarna läggs ut.
 * Normalen följer lindningen (moturs = utåt), som i three.js.
 */
export function closestPointOnMesh(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  p: Vec3,
): { point: Vec3; normal: Vec3 } | null {
  const triangles = Math.floor(index.length / 3);
  if (triangles === 0) return null;
  const [px, py, pz] = p;
  let best = Infinity;
  let bestTriangle = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  const q: [number, number, number] = [0, 0, 0];
  for (let t = 0; t < triangles; t++) {
    const a = index[3 * t]! * 3;
    const b = index[3 * t + 1]! * 3;
    const c = index[3 * t + 2]! * 3;
    closestOnTriangle(
      px, py, pz,
      positions[a]!, positions[a + 1]!, positions[a + 2]!,
      positions[b]!, positions[b + 1]!, positions[b + 2]!,
      positions[c]!, positions[c + 1]!, positions[c + 2]!,
      q,
    );
    const d2 = (q[0] - px) ** 2 + (q[1] - py) ** 2 + (q[2] - pz) ** 2;
    if (d2 < best) {
      best = d2;
      bestTriangle = t;
      [bx, by, bz] = q;
    }
  }
  return { point: [bx, by, bz], normal: triangleNormal(positions, index, bestTriangle) };
}

function triangleNormal(positions: ArrayLike<number>, index: ArrayLike<number>, t: number): Vec3 {
  const a = index[3 * t]! * 3;
  const b = index[3 * t + 1]! * 3;
  const c = index[3 * t + 2]! * 3;
  const abx = positions[b]! - positions[a]!;
  const aby = positions[b + 1]! - positions[a + 1]!;
  const abz = positions[b + 2]! - positions[a + 2]!;
  const acx = positions[c]! - positions[a]!;
  const acy = positions[c + 1]! - positions[a + 1]!;
  const acz = positions[c + 2]! - positions[a + 2]!;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

/** Närmaste punkt på triangeln abc (Ericson, Real-Time Collision Detection, 5.1.5). */
function closestOnTriangle(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  out: [number, number, number],
): void {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    out[0] = ax; out[1] = ay; out[2] = az;
    return;
  }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    out[0] = bx; out[1] = by; out[2] = bz;
    return;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz;
    return;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    out[0] = cx; out[1] = cy; out[2] = cz;
    return;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz;
    return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz);
    return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
}

/**
 * Trianglarna (som index, tre per triangel) som har minst ett hörn i
 * regionen. En fläck läggs på ytan inom sin egen region: en fläck på
 * underarmen stannar på underarmen även när den sparats på en kropp med
 * annan armställning (hud-kolls figur) eller annan form (en annan av de
 * tre kropparna). Gränstrianglarna räknas med, så att en fläck nära
 * gränsen inte tvingas bort från den.
 */
export function trianglesInRegion(
  index: ArrayLike<number>,
  regions: ArrayLike<number>,
  regionId: number,
): Uint32Array {
  const out: number[] = [];
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    if (regions[a] === regionId || regions[b] === regionId || regions[c] === regionId) out.push(a, b, c);
  }
  return Uint32Array.from(out);
}
