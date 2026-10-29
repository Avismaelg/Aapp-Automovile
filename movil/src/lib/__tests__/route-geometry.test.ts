import { describe, expect, it } from '@jest/globals';

import { compactRouteCoordinates } from '@/src/lib/route-geometry';

describe('route geometry', () => {
  it('keeps short routes unchanged', () => {
    const points: [number, number][] = [
      [18.48, -69.93],
      [18.481, -69.93],
    ];
    expect(compactRouteCoordinates(points)).toEqual(points);
  });

  it('caps large routes while preserving endpoints', () => {
    const points = Array.from({ length: 2000 }, (_, index) => [18.4 + index / 100000, -69.9] as [number, number]);
    const compacted = compactRouteCoordinates(points);
    expect(compacted.length).toBeLessThanOrEqual(900);
    expect(compacted[0]).toEqual(points[0]);
    expect(compacted[compacted.length - 1]).toEqual(points[points.length - 1]);
  });

  it('no atraviesa una curva pronunciada al reducir la geometría', () => {
    const points = Array.from({ length: 2000 }, (_, index) =>
      [18.4, -69.9 + index / 100000] as [number, number],
    );
    points[777] = [18.41, points[777][1]];

    expect(compactRouteCoordinates(points)).toContainEqual(points[777]);
  });
});
