import { describe, expect, it, jest } from '@jest/globals';

import { appendError, MAX_ERRORS, type ErrorEntry } from '@/src/lib/error-log';

// jest.mock se eleva por encima de los imports.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined },
}));


const entry = (index: number): ErrorEntry => ({ at: `t${index}`, source: 'global', message: `error ${index}` });

describe('RNF-21: registro local de errores', () => {
  it('guarda el más reciente primero y como mucho los últimos 50', () => {
    let list: ErrorEntry[] = [];
    for (let index = 0; index < MAX_ERRORS + 10; index += 1) list = appendError(list, entry(index));
    expect(list).toHaveLength(MAX_ERRORS);
    expect(list[0].message).toBe(`error ${MAX_ERRORS + 9}`);
    expect(list[MAX_ERRORS - 1].message).toBe('error 10');
  });
});
