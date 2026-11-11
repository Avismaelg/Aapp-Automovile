import { describe, expect, it } from '@jest/globals';

import { parseChallengeStart } from '@/src/lib/challenge-start';

describe('punto de salida guardado de un reto', () => {
  it('acepta una coordenada válida', () => {
    expect(parseChallengeStart('{"latitude":18.4861,"longitude":-69.9312}')).toEqual({
      latitude: 18.4861,
      longitude: -69.9312,
    });
  });

  it('ignora datos ausentes, corruptos o de otra forma', () => {
    for (const raw of [
      null,
      '',
      'no es json',
      'null',
      '[]',
      '{"latitude":"18.48","longitude":-69.93}',
      '{"latitude":18.48}',
      '{"latitude":91,"longitude":-69.93}',
      '{"latitude":18.48,"longitude":181}',
      '{"latitude":null,"longitude":-69.93}',
    ]) {
      expect(parseChallengeStart(raw)).toBeNull();
    }
  });
});
