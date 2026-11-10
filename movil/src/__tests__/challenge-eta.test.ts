import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { challengeEtaS, compareRacers, shouldReportProgress } from '@/src/lib/convoy';

// RETO-05: en carrera manda el tiempo real que falta, no el % en línea recta.
describe('clasificación por tiempo de llegada', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const fresh = new Date(now - 30_000).toISOString();
  const old = new Date(now - 10 * 60_000).toISOString();

  it('quien llega antes va delante aunque lleve menos %', () => {
    // A lleva más % en línea recta pero está en un tapón (15 min); B, 9 min.
    const a = { finishRank: null, etaS: 900, etaAt: fresh, progressPct: 70 };
    const b = { finishRank: null, etaS: 540, etaAt: fresh, progressPct: 55 };
    expect(compareRacers(a, b, now)).toBeGreaterThan(0);
  });

  it('los que ya llegaron van por su puesto y siempre delante', () => {
    const first = { finishRank: 1, progressPct: 100 };
    const racing = { finishRank: null, etaS: 10, etaAt: fresh, progressPct: 99 };
    expect(compareRacers(first, racing, now)).toBeLessThan(0);
  });

  it('una ETA vieja no cuenta (sin señal): se ordena por avance', () => {
    const stale = { finishRank: null, etaS: 60, etaAt: old, progressPct: 40 };
    const live = { finishRank: null, etaS: 600, etaAt: fresh, progressPct: 20 };
    expect(compareRacers(stale, live, now)).toBeGreaterThan(0);
  });

  it('ETA: la de la ruta si navegas hacia la meta; si no, una estimación prudente', () => {
    expect(challengeEtaS(5_000, 60, 420)).toBe(420);
    // 5 km × 1,3 a 25 km/h como mínimo (parado no se queda para siempre).
    expect(challengeEtaS(5_000, 0, null)).toBe(Math.round((5_000 * 1.3) / (25 / 3.6)));
  });

  it('en un tapón se reinforma aunque el % no cambie', () => {
    const last = { pct: 40, at: now };
    expect(shouldReportProgress(last, { pct: 40, at: now + 10_000, arrived: false })).toBe(false);
    expect(shouldReportProgress(last, { pct: 40, at: now + 16_000, arrived: false })).toBe(true);
  });

  it('el servidor guarda la ETA y conserva las comprobaciones de llegada', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261104127000_challenge_eta.sql'),
      'utf8',
    );
    expect(sql).toContain('p_eta_s integer default null');
    expect(sql).toContain("raise exception 'not_at_finish'");
    expect(sql).toContain('arrival_verified = v_verified');
  });
});
