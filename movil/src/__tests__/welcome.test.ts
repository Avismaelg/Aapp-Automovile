import { afterEach, describe, expect, it } from '@jest/globals';

import { setLanguageForTests } from '@/src/i18n';
import { buildGreeting } from '@/src/lib/welcome';

const base = { name: 'Ismael García', hour: 16, firstTime: false, friendsOnMap: 0, totalDistanceM: 0 };

afterEach(() => setLanguageForTests('es'));

describe('saludo de bienvenida', () => {
  it('saluda por la hora y el nombre de pila', () => {
    expect(buildGreeting(base).title).toBe('Buenas tardes, Ismael');
    expect(buildGreeting({ ...base, hour: 8 }).title).toBe('Buenos días, Ismael');
    expect(buildGreeting({ ...base, hour: 23 }).title).toBe('Buenas noches, Ismael');
    expect(buildGreeting({ ...base, name: '  ' }).title).toBe('Buenas tardes');
  });

  it('cuenta lo que te espera: party, vehículo o una pregunta', () => {
    expect(buildGreeting({ ...base, partyName: 'Ruta norte', vehicleName: 'Civic' }).subtitle).toBe(
      'Tu party «Ruta norte» te espera.',
    );
    expect(buildGreeting({ ...base, vehicleName: 'Civic' }).subtitle).toBe('Tu Civic está listo para rodar.');
    expect(buildGreeting(base).subtitle).toBe('¿A dónde vamos hoy?');
  });

  it('añade amigos en el mapa y kilómetros recorridos', () => {
    expect(buildGreeting({ ...base, friendsOnMap: 1, totalDistanceM: 500 }).chips).toEqual(['1 amigo en el mapa']);
    expect(buildGreeting({ ...base, friendsOnMap: 3, totalDistanceM: 2500 }).chips).toEqual([
      '3 amigos en el mapa',
      '2.5 km recorridos',
    ]);
  });

  it('distingue la primera vez y habla inglés', () => {
    expect(buildGreeting({ ...base, firstTime: true }).eyebrow).toBe('TE DAMOS LA BIENVENIDA');
    setLanguageForTests('en');
    const greeting = buildGreeting({ ...base, vehicleName: 'Civic' });
    expect(greeting.title).toBe('Good afternoon, Ismael');
    expect(greeting.subtitle).toBe('Your Civic is ready to roll.');
    expect(greeting.eyebrow).toBe('GOOD TO SEE YOU');
  });
});
