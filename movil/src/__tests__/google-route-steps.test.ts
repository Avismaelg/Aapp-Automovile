import { describe, expect, it } from '@jest/globals';

import { speakableStreet } from '@/src/lib/route-instructions';

import { streetFromInstruction } from '../../supabase/functions/routes/street';

// Instrucciones reales de Google Routes en RD (Zona Colonial → Ágora Mall).
describe('MAPA-14: la calle de cada instrucción de Google', () => {
  it.each([
    ['Dirígete hacia el este hacia C. Isabel La Católica', 'C. Isabel La Católica'],
    [
      'Gira a la izquierda en Casa Naemie de cuidado de sus sueños !!! hacia C. Isabel La Católica\nPasa por Escuela Nacional de Artes Visuales (a la izquierda).',
      'C. Isabel La Católica',
    ],
    ['Gira a la izquierda en Cajero BanReservas hacia C. Mercedes\nPasa por VBermor Hotel', 'C. Mercedes'],
    ['Gira a la derecha en CT - 33 Zona Colonial hacia C. 19 de Marzo', 'C. 19 de Marzo'],
    ['En Jaragua Muebles, continúa por Av. San Martín\nPasa por Hotel', 'Av. San Martín'],
    [
      'Gira a la izquierda en NEFFOOD SRL hacia el ramal a Av. John F. Kennedy\nPasa por Editora FJM',
      'Av. John F. Kennedy',
    ],
    [
      'Toma el ramal de la izquierda en dirección Autop. Juan Pablo Duarte/Expreso John F. Kennedy',
      'Autop. Juan Pablo Duarte/Expreso John F. Kennedy',
    ],
    ['Toma la salida para incorporarte a Av. John F. Kennedy\nPasa por …', 'Av. John F. Kennedy'],
    ['Mantente a la derecha para continuar por Doctores Mallén\nEl destino está a la derecha.', 'Doctores Mallén'],
    ['Continúa por Av. John F. Kennedy', 'Av. John F. Kennedy'],
  ])('«%s» → %s', (text, street) => {
    expect(streetFromInstruction(text)).toBe(street);
  });

  it('sin calle (solo un punto cardinal o nada) no inventa una', () => {
    expect(streetFromInstruction('Dirígete hacia el norte')).toBeUndefined();
    expect(streetFromInstruction(undefined)).toBeUndefined();
  });
});

describe('MAPA-15: la voz dice las abreviaturas enteras', () => {
  it('«C.», «Av.» y «Autop.» se pronuncian como calle, avenida y autopista', () => {
    expect(speakableStreet('Gira a la izquierda hacia C. Mercedes')).toBe('Gira a la izquierda hacia calle Mercedes');
    expect(speakableStreet('Continúa por Av. John F. Kennedy')).toBe('Continúa por avenida John F. Kennedy');
    expect(speakableStreet('Toma Autop. Juan Pablo Duarte')).toBe('Toma autopista Juan Pablo Duarte');
    // «F.» de John F. Kennedy no es una calle.
    expect(speakableStreet('Av. John F. Kennedy')).toBe('avenida John F. Kennedy');
  });
});
