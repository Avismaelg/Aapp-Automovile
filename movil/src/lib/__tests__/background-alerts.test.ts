import { describe, expect, it, jest } from '@jest/globals';

import { alertsToShow, type PendingAlert } from '@/src/lib/background-alerts';

// jest.mock se eleva antes de los imports: aquí solo funciona require.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-notifications', () => ({ AndroidImportance: { HIGH: 4 } }));

const alert = (id: string): PendingAlert => ({ id, title: id, body: '', url: '/(tabs)/party' });

describe('avisos con la app cerrada', () => {
  it('cada invitación, reto o cambio de destino se avisa una sola vez', () => {
    // Minuto 1: llegan una invitación y un reto.
    let state = alertsToShow([alert('invite:1'), alert('challenge:9')], []);
    expect(state.show.map((a) => a.id)).toEqual(['invite:1', 'challenge:9']);
    // Minuto 2: siguen pendientes (no los has abierto): no se repiten.
    state = alertsToShow([alert('invite:1'), alert('challenge:9')], state.seen);
    expect(state.show).toHaveLength(0);
    // Minuto 3: el convoy cambia de destino: solo ese aviso.
    state = alertsToShow([alert('invite:1'), alert('destination:p1:t2')], state.seen);
    expect(state.show.map((a) => a.id)).toEqual(['destination:p1:t2']);
  });

  it('lo que ya viste en pantalla no llega como notificación', () => {
    const seenInApp = alertsToShow([alert('invite:5')], []).seen;
    expect(alertsToShow([alert('invite:5')], seenInApp).show).toHaveLength(0);
  });

  it('reinvitar (nueva fecha) vuelve a avisar', () => {
    const first = alertsToShow([alert('invite:1:2026-11-01T10:00')], []);
    const again = alertsToShow([alert('invite:1:2026-11-01T12:00')], first.seen);
    expect(again.show).toHaveLength(1);
  });

  it('la memoria de avisos no crece sin límite', () => {
    let seen: string[] = [];
    for (let i = 0; i < 500; i += 1) seen = alertsToShow([alert(`invite:${i}`)], seen).seen;
    expect(seen.length).toBeLessThanOrEqual(150);
    expect(seen[seen.length - 1]).toBe('invite:499');
  });
});
