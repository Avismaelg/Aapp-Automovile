import { describe, expect, it } from '@jest/globals';

import {
  cumulativeDistances,
  followingInstruction,
  formatInstructionDistance,
  instructionsFromOsrm,
  nextInstruction,
  routeProgress,
  spokenInstruction,
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

  it('anuncia la maniobra siguiente solo si está cerca de la próxima', () => {
    const list = [
      { icon: 'right' as const, text: 'Gira a la derecha', atDistanceM: 500 },
      { icon: 'left' as const, text: 'Gira a la izquierda', atDistanceM: 650 },
      { icon: 'arrive' as const, text: 'Has llegado a tu destino', atDistanceM: 2_000 },
    ];
    expect(followingInstruction(list, list[0])?.icon).toBe('left');
    expect(followingInstruction(list, list[1])).toBeNull();
    expect(followingInstruction(list, null)).toBeNull();
  });

  it('dice la distancia antes de la maniobra y solo la orden al llegar', () => {
    expect(spokenInstruction('Gira a la derecha por Av. Duarte', 300)).toBe(
      'En 300 metros, gira a la derecha por Av. Duarte',
    );
    expect(spokenInstruction('Gira a la derecha', 40)).toBe('Gira a la derecha');
  });
});
