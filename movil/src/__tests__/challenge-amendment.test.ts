/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {
  CHALLENGE_OFFLINE_MS,
  countdownSeconds,
  participantState,
} from '@/src/lib/challenge-db';

const NOW = Date.parse('2026-11-03T18:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('RETO-04: cuenta atrás antes de la salida', () => {
  it('cuenta los segundos que faltan y llega a cero al salir', () => {
    expect(countdownSeconds(iso(4_200), NOW)).toBe(5);
    expect(countdownSeconds(iso(900), NOW)).toBe(1);
    expect(countdownSeconds(iso(-1_000), NOW)).toBe(0);
    expect(countdownSeconds(null, NOW)).toBe(0);
  });
});

describe('RETO-07: abandonó o sin conexión, y el reto sigue', () => {
  const live = { status: 'live' as const, startsAt: iso(-10 * 60_000) };

  it('marca al que abandona y al que llega', () => {
    expect(participantState(live, { status: 'abandoned', isMe: false }, NOW)).toBe('abandoned');
    expect(participantState(live, { status: 'finished', isMe: false }, NOW)).toBe('finished');
  });

  it('sin avances en 2 min, un rival sale «sin conexión»; tú nunca', () => {
    const stale = { status: 'accepted' as const, isMe: false, lastProgressAt: iso(-CHALLENGE_OFFLINE_MS - 1_000) };
    expect(participantState(live, stale, NOW)).toBe('offline');
    expect(participantState(live, { ...stale, isMe: true }, NOW)).toBe('racing');
    expect(participantState(live, { ...stale, lastProgressAt: iso(-30_000) }, NOW)).toBe('racing');
  });

  it('antes de la salida nadie está «sin conexión»', () => {
    const pending = { status: 'pending' as const, startsAt: null };
    expect(participantState(pending, { status: 'accepted', isMe: false, lastProgressAt: null }, NOW)).toBe('waiting');
  });
});

describe('RETO-04 / RETO-07 en el servidor', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20261103140000_challenge_amendment.sql'),
    'utf8',
  );
  it('no se avanza ni se llega durante la cuenta atrás', () => {
    expect(sql).toContain("raise exception 'challenge_not_started'");
  });
  it('abandonar deja seguir a los demás y cierra el reto si no queda nadie', () => {
    expect(sql).toContain("set status = 'abandoned'");
    expect(sql).toContain('perform private.close_challenge_if_done(p_challenge_id)');
  });
  it('el reto se gana por llegada, sin velocidad (RETO-06)', () => {
    expect(sql).not.toMatch(/speed|velocidad/i);
  });
});
