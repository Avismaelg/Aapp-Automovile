// Coche 3D low-poly generado en código (glTF 2.0 binario, .glb), con la
// carrocería del color del vehículo. Medidas en metros; Y hacia arriba y el
// morro hacia +X.

type Rgba = [number, number, number, number];

type Part = {
  positions: number[];
  normals: number[];
  indices: number[];
};

type MaterialSpec = {
  color: Rgba;
  metallic: number;
  roughness: number;
  emissive?: [number, number, number];
};

function hexToRgba(hex: string): Rgba {
  const clean = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace('#', '') : 'ff5a1f';
  // glTF trabaja en color lineal: se convierte desde sRGB.
  const channel = (offset: number) => {
    const value = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4), 1];
}

function emptyPart(): Part {
  return { positions: [], normals: [], indices: [] };
}

function addQuad(part: Part, corners: number[][], normal: number[]) {
  const base = part.positions.length / 3;
  for (const corner of corners) {
    part.positions.push(corner[0], corner[1], corner[2]);
    part.normals.push(normal[0], normal[1], normal[2]);
  }
  part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function normalOf(a: number[], b: number[], c: number[]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

// Prisma de sección trapezoidal: la base va de x0 a x1 y la parte de arriba
// de t0 a t1 (así el capó y la luna trasera quedan inclinados).
function addFrustum(
  part: Part,
  x0: number,
  x1: number,
  t0: number,
  t1: number,
  y0: number,
  y1: number,
  halfBottom: number,
  halfTop: number,
) {
  const b = [
    [x0, y0, -halfBottom],
    [x1, y0, -halfBottom],
    [x1, y0, halfBottom],
    [x0, y0, halfBottom],
  ];
  const t = [
    [t0, y1, -halfTop],
    [t1, y1, -halfTop],
    [t1, y1, halfTop],
    [t0, y1, halfTop],
  ];
  const faces = [
    [t[0], t[3], t[2], t[1]], // arriba
    [b[0], b[1], b[2], b[3]], // abajo
    [b[1], t[1], t[2], b[2]], // delante (+X)
    [b[3], t[3], t[0], b[0]], // detrás (−X)
    [b[2], t[2], t[3], b[3]], // derecha (+Z)
    [b[0], t[0], t[1], b[1]], // izquierda (−Z)
  ];
  for (const face of faces) addQuad(part, face, normalOf(face[0], face[1], face[2]));
}

function addBox(part: Part, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const half = (z1 - z0) / 2;
  const center = (z0 + z1) / 2;
  const start = part.positions.length;
  addFrustum(part, x0, x1, x0, x1, y0, y1, half, half);
  for (let index = start + 2; index < part.positions.length; index += 3) {
    part.positions[index] += center;
  }
}

// Rueda: cilindro con el eje en Z.
function addWheel(part: Part, cx: number, cz: number, radius: number, width: number) {
  const segments = 14;
  const z0 = cz - width / 2;
  const z1 = cz + width / 2;
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, radius + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, radius + Math.sin(a1) * radius];
    const mid = (a0 + a1) / 2;
    addQuad(
      part,
      [
        [p0[0], p0[1], z0],
        [p1[0], p1[1], z0],
        [p1[0], p1[1], z1],
        [p0[0], p0[1], z1],
      ],
      [Math.cos(mid), Math.sin(mid), 0],
    );
    for (const [z, sign] of [
      [z1, 1],
      [z0, -1],
    ] as const) {
      const base = part.positions.length / 3;
      part.positions.push(cx, radius, z, p0[0], p0[1], z, p1[0], p1[1], z);
      for (let k = 0; k < 3; k += 1) part.normals.push(0, 0, sign);
      if (sign > 0) part.indices.push(base, base + 1, base + 2);
      else part.indices.push(base, base + 2, base + 1);
    }
  }
}

function buildParts(): { part: Part; material: MaterialSpec | 'body' }[] {
  const body = emptyPart();
  // Carrocería baja (de parachoques a parachoques) y cabina estrecha encima.
  addFrustum(body, -2.2, 2.2, -2.15, 2.1, 0.3, 0.85, 0.9, 0.88);
  addFrustum(body, -1.35, 0.95, -1.15, 0.45, 0.85, 1.38, 0.82, 0.68);

  const glass = emptyPart();
  // Lunas un pelín por fuera de la cabina para que se vean.
  addFrustum(glass, 0.47, 0.98, 0.43, 0.47, 0.9, 1.33, 0.8, 0.66);
  addFrustum(glass, -1.38, -1.0, -1.16, -1.12, 0.9, 1.33, 0.8, 0.66);
  addBox(glass, -1.05, 0.35, 0.92, 1.3, -0.835, 0.835);

  const tires = emptyPart();
  for (const x of [-1.35, 1.35]) {
    for (const z of [-0.8, 0.8]) addWheel(tires, x, z, 0.34, 0.26);
  }

  const front = emptyPart();
  addBox(front, 2.17, 2.23, 0.62, 0.74, -0.78, -0.45);
  addBox(front, 2.17, 2.23, 0.62, 0.74, 0.45, 0.78);

  const rear = emptyPart();
  addBox(rear, -2.23, -2.17, 0.6, 0.74, -0.8, -0.42);
  addBox(rear, -2.23, -2.17, 0.6, 0.74, 0.42, 0.8);

  return [
    { part: body, material: 'body' },
    { part: glass, material: { color: [0.02, 0.03, 0.05, 1], metallic: 0.2, roughness: 0.15 } },
    { part: tires, material: { color: [0.015, 0.015, 0.015, 1], metallic: 0, roughness: 0.9 } },
    { part: front, material: { color: [1, 0.96, 0.8, 1], metallic: 0, roughness: 0.3, emissive: [1, 0.95, 0.75] } },
    { part: rear, material: { color: [0.9, 0.05, 0.05, 1], metallic: 0, roughness: 0.4, emissive: [0.9, 0.05, 0.05] } },
  ];
}

function align4(value: number) {
  return (value + 3) & ~3;
}

export function buildCarGlb(bodyColor: string): Uint8Array {
  const parts = buildParts();
  const chunks: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const primitives: object[] = [];
  const materials: object[] = [];
  let offset = 0;

  const pushView = (data: Uint8Array, target: number) => {
    const padded = new Uint8Array(align4(data.byteLength));
    padded.set(data);
    chunks.push(padded);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target });
    offset += padded.byteLength;
    return bufferViews.length - 1;
  };

  parts.forEach(({ part, material }, index) => {
    const positions = new Float32Array(part.positions);
    const normals = new Float32Array(part.normals);
    const indices = new Uint16Array(part.indices);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k], positions[i + k]);
        max[k] = Math.max(max[k], positions[i + k]);
      }
    }
    const positionView = pushView(new Uint8Array(positions.buffer), 34962);
    const normalView = pushView(new Uint8Array(normals.buffer), 34962);
    const indexView = pushView(new Uint8Array(indices.buffer), 34963);
    accessors.push(
      { bufferView: positionView, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: normalView, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: indexView, componentType: 5123, count: indices.length, type: 'SCALAR' },
    );
    const spec: MaterialSpec =
      material === 'body' ? { color: hexToRgba(bodyColor), metallic: 0.35, roughness: 0.35 } : material;
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: spec.color,
        metallicFactor: spec.metallic,
        roughnessFactor: spec.roughness,
      },
      ...(spec.emissive ? { emissiveFactor: spec.emissive } : null),
    });
    primitives.push({
      attributes: { POSITION: index * 3, NORMAL: index * 3 + 1 },
      indices: index * 3 + 2,
      material: index,
    });
  });

  const json = {
    asset: { version: '2.0', generator: 'caravana' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'car' }],
    meshes: [{ primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLength + 8 + offset;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(jsonBytes, 20);
  let cursor = 20 + jsonLength;
  view.setUint32(cursor, offset, true);
  view.setUint32(cursor + 4, 0x004e4942, true); // "BIN"
  cursor += 8;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}
