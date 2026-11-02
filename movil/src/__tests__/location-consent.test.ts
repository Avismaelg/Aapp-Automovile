import { describe, expect, it, jest } from '@jest/globals';
import { Alert, type AlertButton } from 'react-native';

import { askLocationConsent } from '@/src/lib/location-consent';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
});

function answer(label: string) {
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((button) => button.text === label)?.onPress?.();
  });
}

describe('OTR-01: consentimiento antes de pedir la ubicación', () => {
  it('sin aceptar no se pide el permiso y se vuelve a preguntar', async () => {
    answer('Ahora no');
    expect(await askLocationConsent()).toBe(false);
    answer('Acepto');
    expect(await askLocationConsent()).toBe(true);
  });

  it('una vez aceptado no se vuelve a preguntar', async () => {
    const spy = jest.spyOn(Alert, 'alert');
    spy.mockClear();
    expect(await askLocationConsent()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
