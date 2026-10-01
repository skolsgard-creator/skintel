// SVG-konturer som jsPDF-operationer, för ordmärket i journalens huvud.
// Konturerna kommer ur logo-paths.ts, som scripts/rita-logotyp.py skriver
// med absoluta M, L, H, V, Q, C och Z; jsPDF:s path() tar m, l, c och h.
// En kvadratisk kurva blir den kubiska kurva som ritar samma båge. Ett
// kommando som skriptet aldrig skriver stoppas, i stället för att ritas fel.

export type PathOp = { op: "m" | "l" | "c" | "h"; c: number[] };

type Map2 = (x: number, y: number) => [number, number];

const TOKEN = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

export function svgPathOps(d: string, map: Map2): PathOp[] {
  const tokens: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) tokens.push(m[1] ?? Number(m[2]));

  const ops: PathOp[] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  const num = () => {
    const v = tokens[i++];
    if (typeof v !== "number") throw new Error(`svgPathOps: tal saknas efter ${cmd}`);
    return v;
  };
  const point = (px: number, py: number) => map(px, py);

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      cmd = t;
      i++;
      if (!"MLHVQCZ".includes(cmd)) throw new Error(`svgPathOps: ${cmd} stöds inte`);
      if (cmd === "Z") {
        ops.push({ op: "h", c: [] });
        continue;
      }
    } else if (cmd === "" || cmd === "Z") {
      throw new Error("svgPathOps: tal utan kommando");
    }
    switch (cmd) {
      case "M": {
        x = num();
        y = num();
        ops.push({ op: "m", c: point(x, y) });
        cmd = "L"; // fler koordinater efter M är linjer
        break;
      }
      case "L": {
        x = num();
        y = num();
        ops.push({ op: "l", c: point(x, y) });
        break;
      }
      case "H": {
        x = num();
        ops.push({ op: "l", c: point(x, y) });
        break;
      }
      case "V": {
        y = num();
        ops.push({ op: "l", c: point(x, y) });
        break;
      }
      case "Q": {
        const qx = num();
        const qy = num();
        const ex = num();
        const ey = num();
        const c1 = point(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y));
        const c2 = point(ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey));
        ops.push({ op: "c", c: [...c1, ...c2, ...point(ex, ey)] });
        x = ex;
        y = ey;
        break;
      }
      case "C": {
        const c1 = point(num(), num());
        const c2 = point(num(), num());
        x = num();
        y = num();
        ops.push({ op: "c", c: [...c1, ...c2, ...point(x, y)] });
        break;
      }
    }
  }
  return ops;
}
