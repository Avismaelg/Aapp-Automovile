import { describe, expect, it } from '@jest/globals';

import {
  normalizeText,
  rankPlaces,
  searchKnownPlaces,
  textMatch,
  type SearchPlace,
} from '@/src/lib/place-search';

const SANTO_DOMINGO = { latitude: 18.4861, longitude: -69.9312 };

const top = (query: string) => searchKnownPlaces(query, SANTO_DOMINGO).sort((a, b) => (b.match ?? 0) - (a.match ?? 0))[0]?.name;

describe('buscador de destinos', () => {
  it('encuentra Punta Cana aunque lo escribas mal', () => {
    for (const query of ['punta cana', 'Punta Cana', 'punta cna', 'punta cnaa', 'punat cana', 'puntacana', 'PUNTA CANA ']) {
      expect(top(query)).toBe('Punta Cana');
    }
  });

  it('sin tildes y con faltas', () => {
    expect(top('bavaro')).toBe('Bávaro');
    expect(top('higuey')).toBe('Higüey');
    expect(top('samana')).toBe('Samaná');
    expect(top('jarabacao')).toBe('Jarabacoa');
    expect(top('constansa')).toBe('Constanza');
    expect(top('aila')).toBe('Aeropuerto Las Américas');
    expect(top('agora')).toBe('Ágora Mall');
  });

  it('mientras escribes ya sugiere (última palabra a medias)', () => {
    expect(top('punta ca')).toBe('Punta Cana');
    expect(top('las terr')).toBe('Las Terrenas');
  });

  it('entiende abreviaturas de direcciones', () => {
    expect(textMatch('av winston churchill', 'Avenida Winston Churchill')).toBe(1);
    expect(textMatch('c/ el conde', 'Calle El Conde')).toBe(1);
    expect(textMatch('aut duarte', 'Autopista Duarte')).toBe(1);
    expect(top('pto plata')).toBe('Puerto Plata');
  });

  it('no inventa coincidencias', () => {
    expect(textMatch('farmacia', 'Punta Cana')).toBe(0);
    expect(searchKnownPlaces('xyzw', SANTO_DOMINGO)).toHaveLength(0);
  });

  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizeText('  Bávaro, LA Altagracia ')).toBe('bavaro la altagracia');
  });

  it('la ciudad de Punta Cana gana a la «Calle Punta Cana» de tu barrio', () => {
    const place = (id: string, name: string, distanceM: number, importance: number): SearchPlace => ({
      id,
      name,
      detail: '',
      latitude: 18 + distanceM / 1e7,
      longitude: -69,
      distanceM,
      importance,
      match: textMatch('punta cana', name),
    });
    const ranked = rankPlaces([
      place('calle', 'Calle Punta Cana', 9_000, 0.35),
      place('parada', 'Expreso Bavaro & Punta Cana', 4_000, 0.1),
      place('ciudad', 'Punta Cana', 190_000, 1),
    ]);
    expect(ranked[0].id).toBe('ciudad');
  });

  it('para cosas genéricas manda la cercanía', () => {
    const place = (id: string, distanceM: number): SearchPlace => ({
      id,
      name: `Farmacia ${id}`,
      detail: '',
      latitude: 18 + distanceM / 1e5,
      longitude: -69,
      distanceM,
      importance: 0.55,
      match: textMatch('farmacia', `Farmacia ${id}`),
    });
    const ranked = rankPlaces([place('lejos', 40_000), place('cerca', 800), place('media', 9_000)]);
    expect(ranked.map((p) => p.id)).toEqual(['cerca', 'media', 'lejos']);
  });

  it('el mismo sitio del listado y del mapa sale una vez', () => {
    const base = { detail: '', distanceM: 190_000, longitude: -68.36916 };
    const ranked = rankPlaces([
      { ...base, id: 'known', name: 'Punta Cana', latitude: 18.55655, importance: 1, match: 1 },
      { ...base, id: 'photon', name: 'Punta Cana', latitude: 18.5566, importance: 0.95, match: 1 },
    ]);
    expect(ranked).toHaveLength(1);
  });
});
