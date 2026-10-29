import { describe, expect, it } from '@jest/globals';

import { tripAchievements } from '@/src/lib/achievements';
import type { Trip } from '@/src/store/trips';

const DAY = 24 * 3_600_000;
const NOW = Date.parse('2026-10-29T12:00:00Z');

function trip(id: string, km: number, daysAgo: number, ended = true): Trip {
  const startedAt = NOW - daysAgo * DAY;
  return {
    id,
    startedAt,
    endedAt: ended ? startedAt + 3_600_000 : null,
    distanceM: km * 1000,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
    points: [],
  };
}

describe('logros de viajes', () => {
  it('sin viajes terminados no hay logros', () => {
    expect(tripAchievements([trip('a', 10, 0, false)], NOW)).toEqual([]);
  });

  it('suma distancia, busca el más largo y cuenta días activos del último mes', () => {
    const list = tripAchievements([trip('a', 12, 1), trip('b', 30, 2), trip('c', 5, 40)], NOW);
    expect(list.map((item) => item.id)).toEqual(['distance', 'longest', 'streak']);
    expect(list[0].detail).toContain('3 viajes');
    expect(list[1].detail).toContain('30');
    expect(list[2].detail).toContain('2 días');
  });
});
