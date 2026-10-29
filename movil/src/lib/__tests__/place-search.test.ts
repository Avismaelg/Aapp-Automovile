import { describe, expect, it } from '@jest/globals';

import { rankByProximity, type SearchPlace } from '@/src/lib/place-search';

const place = (id: string, distanceM: number | null): SearchPlace => ({
  id,
  latitude: 0,
  longitude: 0,
  name: id,
  detail: '',
  distanceM,
});

describe('búsqueda de destinos', () => {
  it('pone primero lo cercano sin romper el orden de relevancia', () => {
    const ranked = rankByProximity([
      place('india', 13_853_900),
      place('kennedy', 5_800),
      place('santiago', 150_000),
      place('lincoln', 5_900),
      place('sin-distancia', null),
    ]);
    expect(ranked.map((item) => item.id)).toEqual([
      'kennedy',
      'lincoln',
      'santiago',
      'india',
      'sin-distancia',
    ]);
  });
});
