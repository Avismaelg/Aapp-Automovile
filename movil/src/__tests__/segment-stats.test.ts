import { describe, expect, it } from '@jest/globals';

import type { HighwaySegment } from '@/src/lib/highway-records';
import { segmentStats } from '@/src/lib/segment-stats';
import type { Trip } from '@/src/store/trips';

const SEGMENT: HighwaySegment = {
  id: 's',
  slug: 's',
  name: 'Tramo',
  city: null,
  speedLimitKmh: 80,
  polyline: [
    [18.4, -69.9],
    [18.41, -69.9],
  ],
};

const trip = (speeds: (number | null)[], onSegment = true): Trip =>
  ({
    id: Math.random().toString(),
    startedAt: 0,
    endedAt: 1,
    points: speeds.map((speedKmh, index) => ({
      latitude: onSegment ? 18.4 + index * 0.001 : 18.6,
      longitude: -69.9,
      speedKmh,
      at: index,
    })),
  }) as unknown as Trip;

// P0-4: por tramo solo pasadas y % dentro del límite; nunca una velocidad.
describe('estadísticas privadas por tramo', () => {
  it('cuenta pasadas y la parte dentro del límite', () => {
    const stats = segmentStats([trip([70, 75, 90, 60]), trip([50, 55])], SEGMENT);
    expect(stats.passes).toBe(2);
    expect(stats.withinLimitPct).toBe(83);
  });

  it('parado o fuera del tramo no cuenta', () => {
    expect(segmentStats([trip([0, 5, null])], SEGMENT)).toEqual({ passes: 1, withinLimitPct: null });
    expect(segmentStats([trip([90], false)], SEGMENT)).toEqual({ passes: 0, withinLimitPct: null });
  });

  it('no expone ninguna velocidad', () => {
    expect(Object.keys(segmentStats([trip([70])], SEGMENT)).sort()).toEqual(['passes', 'withinLimitPct']);
  });
});
