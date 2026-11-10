/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {
  CONVOY_ARRIVE_M,
  convoyMemberLabel,
  newArrivals,
  reachedConvoyGoal,
  sortByArrival,
} from '@/src/lib/convoy';
import { quickMessages, typingBlocked, unreadCount } from '@/src/lib/party-chat';

const NOW = Date.parse('2026-11-03T15:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const member = (id: string, extra: Partial<Parameters<typeof convoyMemberLabel>[0]> = {}) => ({
  id,
  lastSeenAt: ago(5_000),
  speedKmh: 40,
  etaS: null as number | null,
  remainingM: null as number | null,
  progressAt: null as string | null,
  arrivedAt: null as string | null,
  ...extra,
});

describe('CONV-04 / CONV-05: ETA de cada miembro y orden por llegada', () => {
  it('muestra «LLEGA EN X MIN · distancia» con una ETA reciente', () => {
    const label = convoyMemberLabel(
      member('a', { etaS: 420, remainingM: 3_200, progressAt: ago(10_000) }),
      NOW,
      (m) => `${(m / 1000).toFixed(1)} km`,
    );
    expect(label).toBe('LLEGA EN 7 MIN · 3.2 KM');
  });

  it('una ETA vieja no se muestra (vuelve al estado en vivo)', () => {
    const label = convoyMemberLabel(member('a', { etaS: 420, progressAt: ago(5 * 60_000) }), NOW, String);
    expect(label).toBe('40 KM/H');
  });

  it('ordena: primero quien llegó, luego por ETA, luego quien no publica', () => {
    const list = [
      member('sin-eta'),
      member('lejos', { etaS: 900, progressAt: ago(5_000) }),
      member('cerca', { etaS: 120, progressAt: ago(5_000) }),
      member('llego-2', { arrivedAt: ago(60_000) }),
      member('llego-1', { arrivedAt: ago(120_000) }),
    ];
    expect(sortByArrival(list, NOW).map((item) => item.id)).toEqual([
      'llego-1',
      'llego-2',
      'cerca',
      'lejos',
      'sin-eta',
    ]);
  });
});

describe('CONV-06: llegada a la meta común', () => {
  const goal = { latitude: 18.4719, longitude: -69.9396 };
  it('llega por la ruta restante o por la distancia directa', () => {
    expect(reachedConvoyGoal(goal, goal, null)).toBe(true);
    expect(reachedConvoyGoal({ latitude: 18.48, longitude: -69.93 }, goal, 2_000)).toBe(false);
    expect(reachedConvoyGoal({ latitude: 18.48, longitude: -69.93 }, goal, CONVOY_ARRIVE_M - 1)).toBe(true);
    expect(reachedConvoyGoal(goal, null, 0)).toBe(false);
  });

  it('avisa una sola vez de cada llegada y nunca de la tuya', () => {
    const previous = new Map<string, string | null>([['ana', null], ['yo', null]]);
    const members = [
      { userId: 'ana', arrivedAt: ago(1_000) },
      { userId: 'yo', arrivedAt: ago(1_000), isMe: true },
    ];
    expect(newArrivals(previous, members).map((item) => item.userId)).toEqual(['ana']);
    const after = new Map(members.map((item) => [item.userId, item.arrivedAt]));
    expect(newArrivals(after, members)).toEqual([]);
  });
});

describe('CONV-10 / CONV-12: chat seguro al volante', () => {
  it('bloquea escribir por encima de 10 km/h salvo de pasajero', () => {
    expect(typingBlocked(0, false)).toBe(false);
    expect(typingBlocked(9, false)).toBe(false);
    expect(typingBlocked(35, false)).toBe(true);
    expect(typingBlocked(35, true)).toBe(false);
    expect(typingBlocked(null, false)).toBe(false);
  });

  it('los mensajes rápidos usan tu ETA real si la hay', () => {
    expect(quickMessages(12)).toContain('Llego en 12 min');
    expect(quickMessages(null)).toContain('Llego en 5 min');
  });

  it('cuenta como no leídos solo los mensajes de otros posteriores al último leído', () => {
    const messages = [
      { id: 1, isMe: false },
      { id: 2, isMe: true },
      { id: 3, isMe: false },
      { id: 4, isMe: false },
    ];
    expect(unreadCount(messages, undefined)).toBe(3);
    expect(unreadCount(messages, 3)).toBe(1);
    expect(unreadCount(messages, 4)).toBe(0);
  });
});

describe('CONV-02 / CONV-08: permisos del anfitrión en el servidor', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20261103120000_convoy_progress.sql'),
    'utf8',
  );
  it('solo el anfitrión o un copiloto cambian el destino', () => {
    expect(sql).toContain("if v_host <> v_uid and v_role <> 'sweeper' then raise exception 'not_allowed'");
  });
  it('expulsar, nombrar copiloto y terminar exigen ser anfitrión', () => {
    for (const fn of ['kick_party_member', 'set_party_member_role', 'end_party']) {
      const body = sql.slice(sql.indexOf(`function private.${fn}`));
      expect(body.slice(0, 600)).toContain("raise exception 'not_host'");
    }
  });
});
