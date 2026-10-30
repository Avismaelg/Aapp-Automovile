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

  it('lo que está a menos de 3 km va antes que lo más relevante de la ciudad', () => {
    const ranked = rankByProximity([
      place('relevante-lejos', 9_500),
      place('cerca', 800),
      place('cerca-2', 2_100),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(['cerca', 'cerca-2', 'relevante-lejos']);
  });
});
