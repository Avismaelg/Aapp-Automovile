import { describe, expect, it } from '@jest/globals';

import { WORLD_MAP_HTML } from '@/src/lib/map-html';

// El script del mapa vive dentro de un string: un error de sintaxis no lo
// detecta TypeScript y en el móvil solo se ve como un mapa en blanco.
describe('documento del mapa', () => {
  const inline = WORLD_MAP_HTML.match(/<script>([\s\S]*?)<\/script>/);

  it('incluye un script en línea', () => {
    expect(inline).not.toBeNull();
  });

  it('el script es JavaScript válido', () => {
    expect(() => new Function(inline?.[1] ?? '')).not.toThrow();
  });

  it('no deja interpolaciones sin resolver', () => {
    expect(WORLD_MAP_HTML).not.toMatch(/\$\{[A-Z_]+\}/);
  });
});
