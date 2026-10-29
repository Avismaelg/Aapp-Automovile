import { describe, expect, it } from '@jest/globals';

import { buildCarGlb } from '@/src/lib/car-model';

function readGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
  return { view, json, jsonLength };
}

describe('coche 3D', () => {
  it('genera un glTF binario válido', () => {
    const bytes = buildCarGlb('#ff5a1f');
    const { view, json, jsonLength } = readGlb(bytes);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    expect(view.getUint32(20 + jsonLength + 4, true)).toBe(0x004e4942);
    expect(json.asset.version).toBe('2.0');
    expect(json.meshes[0].primitives).toHaveLength(5);
    expect(json.buffers[0].byteLength).toBe(view.getUint32(20 + jsonLength, true));
  });

  it('pinta la carrocería con el color del vehículo', () => {
    const { json } = readGlb(buildCarGlb('#ffffff'));
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([1, 1, 1, 1]);
    const { json: fallback } = readGlb(buildCarGlb('no-es-color'));
    expect(fallback.materials[0].pbrMetallicRoughness.baseColorFactor[0]).toBeCloseTo(1, 2);
  });
});
