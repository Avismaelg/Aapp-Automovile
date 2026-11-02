import { afterEach, describe, expect, it } from '@jest/globals';

import en from '@/src/i18n/en.json';
import {
  displaySpeed,
  displayToKm,
  formatKmValue,
  kmToDisplay,
  formatDistance,
  formatManeuverDistance,
  resolveLanguage,
  setLanguageForTests,
  setMilesForTests,
  speedUnit,
  t,
} from '@/src/i18n';
import { spokenInstruction } from '@/src/lib/route-instructions';

const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort().join(',');

afterEach(() => {
  setLanguageForTests('es');
  setMilesForTests(false);
});

describe('idiomas', () => {
  it('cada traducción conserva los huecos {0}, {1}… del texto original', () => {
    const broken = Object.entries(en as Record<string, string>).filter(
      ([key, value]) => placeholders(key) !== placeholders(value),
    );
    expect(broken).toEqual([]);
  });

  it('elige español solo si el teléfono está en español', () => {
    expect(resolveLanguage('auto', 'es')).toBe('es');
    expect(resolveLanguage('auto', 'fr')).toBe('en');
    expect(resolveLanguage('auto', null)).toBe('en');
    expect(resolveLanguage('es', 'en')).toBe('es');
  });

  it('traduce al inglés y rellena los huecos', () => {
    expect(t('Reintentar')).toBe('Reintentar');
    setLanguageForTests('en');
    expect(t('Reintentar')).toBe('Retry');
    expect(t('Seguir a {0}', 'Laura')).toBe('Follow Laura');
    expect(t('Texto que no está en el diccionario')).toBe('Texto que no está en el diccionario');
  });

  it('usa millas, pies y mph donde toca', () => {
    expect(formatManeuverDistance(300)).toBe('300 m');
    expect(speedUnit()).toBe('km/h');
    setMilesForTests(true);
    expect(formatManeuverDistance(300)).toBe('1000 ft');
    expect(formatDistance(16093.44)).toBe('10 mi');
    expect(displaySpeed(100)).toBe(62);
    expect(speedUnit()).toBe('mph');
  });

  it('odómetro y mantenimiento: se guardan en km y se muestran en millas', () => {
    expect(formatKmValue(47210)).toBe('47,210 km');
    setMilesForTests(true);
    expect(formatKmValue(47210)).toBe('29,335 mi');
    expect(Math.round(displayToKm(100))).toBe(161);
    expect(displayToKm(kmToDisplay(52210))).toBeCloseTo(52210, 6);
  });

  it('dice la maniobra en inglés', () => {
    setLanguageForTests('en');
    setMilesForTests(true);
    expect(spokenInstruction(t('Gira a la derecha{0}', t(' por {0}', 'Main St')), 300)).toBe(
      'In 1000 feet, turn right onto Main St',
    );
  });
});
