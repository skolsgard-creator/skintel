// Läser public/figur/figur.bin, skriven av scripts/rita-figur.py:
//   "SKF1" | uint32 hörn | uint32 trianglar | float32 skala
//   int16 × 3 × hörn (position / skala) | uint16 × 3 × trianglar | uint8 × hörn (region-id)

export type FigureMesh = {
  positions: Float32Array;
  index: Uint16Array;
  regions: Uint8Array;
  vertexCount: number;
  triangleCount: number;
};

export function parseFigure(buffer: ArrayBuffer): FigureMesh {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "SKF1") throw new Error("figur.bin: okänt format");
  const vertexCount = view.getUint32(4, true);
  const triangleCount = view.getUint32(8, true);
  const scale = view.getFloat32(12, true);
  let offset = 16;
  const quantized = new Int16Array(buffer, offset, vertexCount * 3);
  offset += vertexCount * 6;
  const index = new Uint16Array(buffer, offset, triangleCount * 3);
  offset += triangleCount * 6;
  const regions = new Uint8Array(buffer, offset, vertexCount);
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = quantized[i]! * scale;
  return { positions, index: new Uint16Array(index), regions: new Uint8Array(regions), vertexCount, triangleCount };
}

export async function loadFigure(url = "/figur/figur.bin"): Promise<FigureMesh> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`figur.bin: ${response.status}`);
  return parseFigure(await response.arrayBuffer());
}
