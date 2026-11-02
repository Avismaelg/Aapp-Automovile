import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { secureSessionStorage } from '@/src/lib/secure-session-storage';

// jest.mock se eleva por encima de los imports.

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`clave inválida ${key}`);
    if (value.length > 2048) throw new Error('valor demasiado grande');
    mockSecure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key);
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: async (key: string) => {
        store.delete(key);
      },
    },
  };
});


const KEY = 'sb-ecmqmgpruxclmpnnpgzv-auth-token';
const SESSION = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r'.repeat(500) });

beforeEach(() => mockSecure.clear());

describe('SW-01 / RNF-08: sesión en almacenamiento seguro', () => {
  it('guarda la sesión en trozos dentro de SecureStore y la recupera entera', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
    expect(mockSecure.size).toBeGreaterThan(2);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('mueve una sesión antigua de AsyncStorage sin cerrar la sesión', async () => {
    await AsyncStorage.setItem(KEY, SESSION);
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await secureSessionStorage.getItem(KEY)).toBe(SESSION);
  });

  it('al cerrar sesión no queda nada', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.setItem(KEY, 'corta');
    expect(await secureSessionStorage.getItem(KEY)).toBe('corta');
    await secureSessionStorage.removeItem(KEY);
    expect(mockSecure.size).toBe(0);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });
});
