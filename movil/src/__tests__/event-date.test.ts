import { describe, expect, it } from '@jest/globals';

import { parseEventStart } from '@/src/lib/events';

const now = new Date(2026, 10, 2, 6, 0).getTime();

describe('RF-17: fecha del evento', () => {
  it('acepta una fecha futura y la guarda en ISO', () => {
    const result = parseEventStart('2026-11-08', '09:30', now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Date(result.iso).getTime()).toBe(new Date(2026, 10, 8, 9, 30).getTime());
  });

  it('sin hora usa las 00:00 del día', () => {
    expect(parseEventStart('2026-11-03', '', now).ok).toBe(true);
  });

  it('rechaza fechas pasadas', () => {
    expect(parseEventStart('2026-11-01', '20:00', now)).toEqual({
      ok: false,
      error: 'La fecha del evento ya pasó. Elige una fecha futura.',
    });
    expect(parseEventStart('2026-11-02', '05:59', now).ok).toBe(false);
  });

  it('rechaza formatos y fechas que no existen', () => {
    expect(parseEventStart('08/11/2026', '09:30', now).ok).toBe(false);
    expect(parseEventStart('2026-02-30', '09:30', now).ok).toBe(false);
    expect(parseEventStart('2026-11-08', '25:00', now).ok).toBe(false);
    expect(parseEventStart('2026-11-08', '9h', now).ok).toBe(false);
  });
});
