import { describe, expect, it } from '@jest/globals';

import {
  cumulativeDistances,
  formatInstructionDistance,
  instructionsFromOsrm,
  nextInstruction,
  routeProgress,
} from '@/src/lib/route-instructions';

describe('route instructions', () => {
  it('maps OSRM turns to Spanish instructions and distance', () => {
    const instructions = instructionsFromOsrm([
      { distance: 120, name: 'Calle A', maneuver: { type: 'depart', modifier: 'right' } },
      { distance: 300, name: 'Avenida B', maneuver: { type: 'turn', modifier: 'right' } },
    ]);

    expect(instructions).toHaveLength(2);
    expect(instructions[1]).toMatchObject({
      icon: 'right',
      road: 'Avenida B',
      atDistanceM: 120,
    });
    expect(formatInstructionDistance(150)).toBe('150 m');
  });

  it('finds the next maneuver from route progress', () => {
    const points: [number, number][] = [
      [18.48, -69.93],
      [18.481, -69.93],
      [18.481, -69.929],
    ];
    const cumulative = cumulativeDistances(points);
    const progress = routeProgress(points, cumulative, {
      latitude: 18.4805,
      longitude: -69.93,
    });
    const next = nextInstruction(
      [{ icon: 'right', text: 'Gira a la derecha', atDistanceM: cumulative[1] }],
      progress?.progressM ?? null,
    );

    expect(next?.icon).toBe('right');
    expect(next?.remainingM).toBeGreaterThan(0);
  });
});
