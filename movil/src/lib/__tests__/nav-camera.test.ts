import { describe, expect, it } from '@jest/globals';

import { navCamera } from '@/src/lib/nav-camera';

describe('navCamera', () => {
  it('en ciudad va cerca del coche e inclinada', () => {
    const camera = navCamera({ speedKmh: 30, walking: false, driving: true });
    expect(camera.zoom).toBeGreaterThanOrEqual(17.5);
    expect(camera.pitch).toBeGreaterThanOrEqual(45);
    expect(camera.topPaddingRatio).toBeGreaterThan(0.3);
  });

  it('se abre poco a poco con la velocidad', () => {
    const zooms = [0, 20, 40, 60, 80, 100, 120, 140].map(
      (speedKmh) => navCamera({ speedKmh, walking: false, driving: true }).zoom,
    );
    for (let i = 1; i < zooms.length; i += 1) expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1]);
    expect(zooms[zooms.length - 1]).toBeGreaterThanOrEqual(15.75);
  });

  it('se acerca antes de un giro', () => {
    const far = navCamera({ speedKmh: 60, walking: false, driving: true, maneuverM: 600 });
    const near = navCamera({ speedKmh: 60, walking: false, driving: true, maneuverM: 120 });
    expect(near.zoom).toBeGreaterThan(far.zoom);
  });

  it('no cambia de zoom por pequeñas variaciones del GPS', () => {
    const a = navCamera({ speedKmh: 51, walking: false, driving: true }).zoom;
    const b = navCamera({ speedKmh: 53, walking: false, driving: true }).zoom;
    expect(a).toBe(b);
  });

  it('a pie o con norte arriba la vista es plana', () => {
    expect(navCamera({ speedKmh: 4, walking: true, driving: false }).pitch).toBe(0);
    expect(navCamera({ speedKmh: 40, walking: false, driving: false }).pitch).toBe(0);
  });

  it('velocidades inválidas cuentan como parado', () => {
    expect(navCamera({ speedKmh: Number.NaN, walking: false, driving: true }).zoom).toBe(18);
  });
});
