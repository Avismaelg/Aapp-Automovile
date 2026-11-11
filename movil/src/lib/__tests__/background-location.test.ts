import { describe, expect, it } from '@jest/globals';

import { backgroundLocationAction } from '@/src/lib/background-location';

const action = (subscribers: number, navigating: boolean, hasHandles: boolean, denied = false) =>
  backgroundLocationAction({ subscribers, navigating, hasHandles, denied });

describe('GPS del mapa en segundo plano', () => {
  it('sin suscriptores no hay nada que apagar', () => {
    expect(action(0, false, true)).toBe('none');
    expect(action(0, true, true)).toBe('none');
  });

  it('sin navegación y con handles se apaga todo', () => {
    expect(action(1, false, true)).toBe('stop');
    expect(action(3, false, true)).toBe('stop');
  });

  it('B8: una sesión que aún arranca se pausa para que no abra el GPS en el fondo', () => {
    expect(action(1, false, false)).toBe('pause');
  });

  it('con el permiso denegado no se reintenta solo al volver', () => {
    expect(action(1, false, false, true)).toBe('none');
    expect(action(1, true, false, true)).toBe('none');
  });

  it('navegando se conserva el GPS para la voz; la brújula se apaga aparte', () => {
    expect(action(1, true, true)).toBe('keep-gps');
    expect(action(1, true, false)).toBe('keep-gps');
  });
});
