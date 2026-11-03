/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { shouldPauseGoogle } from '@/src/lib/google-places';
import { mergeGoogleResults, resolvePlace, type SearchPlace } from '@/src/lib/place-search';

const known = (name: string, match: number): SearchPlace => ({
  id: `known:${name}`,
  latitude: 18.47,
  longitude: -69.93,
  name,
  detail: 'Santo Domingo',
  distanceM: 1_000,
  match,
});

describe('MAPA-02: búsqueda con Google Places', () => {
  it('los resultados de Google mantienen su orden y piden las coordenadas al elegirlos', () => {
    const places = mergeGoogleResults(
      [
        { placeId: 'ChIJ_blue_mall_000', name: 'Blue Mall', detail: 'Av. Winston Churchill', distanceM: 900, types: [] },
        { placeId: 'ChIJ_agora_mall_00', name: 'Ágora Mall', detail: 'Av. Abraham Lincoln', distanceM: 1_500, types: [] },
      ],
      [],
    );
    expect(places.map((place) => place.name)).toEqual(['Blue Mall', 'Ágora Mall']);
    expect(places[0].placeId).toBe('ChIJ_blue_mall_000');
    expect(Number.isNaN(places[0].latitude)).toBe(true);
  });

  it('un lugar del listado de RD casi exacto va primero y no se repite', () => {
    const places = mergeGoogleResults(
      [{ placeId: 'ChIJ_sambil_000000', name: 'Sambil', detail: 'SD', distanceM: 3_000, types: [] }],
      [known('Sambil', 1), known('Sambilito', 0.6)],
    );
    expect(places.map((place) => place.id)).toEqual(['known:Sambil']);
  });

  it('un resultado que ya tiene coordenadas no vuelve a preguntar', async () => {
    const place = known('Megacentro', 1);
    await expect(resolvePlace(place)).resolves.toBe(place);
  });

  it('sin función, sin clave o con el tope del día se pausa Google y se usa Photon', () => {
    expect(shouldPauseGoogle(404, 'Function not found')).toBe(true);
    expect(shouldPauseGoogle(503, 'not_configured')).toBe(true);
    expect(shouldPauseGoogle(429, 'daily_limit')).toBe(true);
    expect(shouldPauseGoogle(500, 'Network request failed')).toBe(false);
  });

  it('la clave de Google solo vive en el servidor y hay tope diario por usuario', () => {
    const root = path.join(__dirname, '..', '..');
    const fn = fs.readFileSync(path.join(root, 'supabase/functions/places/index.ts'), 'utf8');
    expect(fn).toContain("Deno.env.get('GOOGLE_MAPS_API_KEY')");
    expect(fn).toContain("rpc('bump_place_search'");
    const sql = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261103090000_place_search_usage.sql'),
      'utf8',
    );
    expect(sql).toContain('return v_count <= greatest(1, p_limit)');
    const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
    expect(env).not.toMatch(/GOOGLE/i);
  });
});
