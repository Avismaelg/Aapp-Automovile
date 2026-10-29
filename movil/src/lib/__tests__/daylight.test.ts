import { describe, expect, it } from '@jest/globals';

import { mapThemeAt, sunTimes } from '@/src/lib/daylight';

// Santo Domingo (UTC−4).
const LAT = 18.4861;
const LNG = -69.9312;

describe('modo día/noche', () => {
  it('calcula salida y puesta de sol en Santo Domingo', () => {
    const { sunrise, sunset } = sunTimes(Date.parse('2026-10-29T16:00:00Z'), LAT, LNG);
    // Finales de octubre: amanece hacia las 6:40 y anochece hacia las 18:15 locales.
    expect(sunrise).toBeGreaterThan(Date.parse('2026-10-29T10:20:00Z'));
    expect(sunrise).toBeLessThan(Date.parse('2026-10-29T11:00:00Z'));
    expect(sunset).toBeGreaterThan(Date.parse('2026-10-29T21:55:00Z'));
    expect(sunset).toBeLessThan(Date.parse('2026-10-29T22:35:00Z'));
  });

  it('usa el mapa de día con sol y el de noche al anochecer', () => {
    expect(mapThemeAt(Date.parse('2026-10-29T16:00:00Z'), LAT, LNG)).toBe('day');
    expect(mapThemeAt(Date.parse('2026-10-29T23:30:00Z'), LAT, LNG)).toBe('night');
    expect(mapThemeAt(Date.parse('2026-10-30T03:00:00Z'), LAT, LNG)).toBe('night');
    expect(mapThemeAt(Date.parse('2026-10-29T09:30:00Z'), LAT, LNG)).toBe('night');
  });

  it('resuelve la noche y el día polares', () => {
    expect(mapThemeAt(Date.parse('2026-12-21T12:00:00Z'), 78, 15)).toBe('night');
    expect(mapThemeAt(Date.parse('2026-06-21T00:00:00Z'), 78, 15)).toBe('day');
  });
});
