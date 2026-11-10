/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { extractFunctionError } from '@/src/lib/alerts';
import { haversineMeters, haversineTupleMeters } from '@/src/lib/geo';
import { fallbackProfile } from '@/src/lib/profile-db';

// Fase 4: una sola versión de cada ayuda compartida.

const src = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(src, file), 'utf8');

describe('4.1 · distancias', () => {
  it('la versión [lat, lng] da lo mismo que la de objetos', () => {
    const a = { latitude: 18.4861, longitude: -69.9312 };
    const b = { latitude: 19.4517, longitude: -70.697 };
    const meters = haversineMeters(a, b);
    expect(meters).toBeGreaterThan(130_000);
    expect(meters).toBeLessThan(135_000);
    expect(haversineTupleMeters([a.latitude, a.longitude], [b.latitude, b.longitude])).toBeCloseTo(meters, 6);
  });

  it('ningún módulo de la app tiene su propia fórmula', () => {
    for (const file of [
      'lib/convoy.ts',
      'lib/parking-logic.ts',
      'lib/route-instructions.ts',
      'lib/driving-line.ts',
      'lib/simulator.ts',
      'hooks/useGraphHopperRoute.ts',
    ]) {
      expect(read(file)).not.toMatch(/Math\.asin\((Math\.min\(1, )?Math\.sqrt\(h\)/);
    }
  });
});

describe('4.2 · perfil de relleno', () => {
  it('sale de profile-db y no hay copias', () => {
    expect(fallbackProfile('abcdef123').qrSlug).toBe('piloto-abcdef');
    for (const file of ['hooks/useParty.ts', 'hooks/useChallenges.ts', 'hooks/useComments.ts']) {
      expect(read(file)).not.toContain('function fallbackProfile');
    }
  });
});

describe('4.3 · crear una party', () => {
  it('crear e invitar usan la misma función', () => {
    expect(read('hooks/useParty.ts')).toContain('return createPartyRecord(account.id, input)');
    const invites = read('hooks/usePartyInvites.ts');
    expect(invites).toContain('createPartyRecord(account.id, { name: defaultPartyName(myName) })');
    expect(invites).not.toContain('createQuickParty');
  });
});

describe('4.4 · errores de las Edge Functions', () => {
  it('usa el motivo del cuerpo JSON y el código HTTP', async () => {
    const context = new Response(JSON.stringify({ error: 'daily_limit' }), { status: 429 });
    await expect(extractFunctionError({ message: 'Edge Function returned a non-2xx status code', context })).resolves.toEqual({
      message: 'daily_limit',
      status: 429,
    });
  });

  it('sin cuerpo JSON (o sin respuesta) vale el mensaje original', async () => {
    const context = new Response('<html>', { status: 502 });
    await expect(extractFunctionError({ message: 'boom', context })).resolves.toEqual({ message: 'boom', status: 502 });
    await expect(extractFunctionError({ message: 'offline' })).resolves.toEqual({ message: 'offline', status: undefined });
  });

  it('el cuerpo se puede volver a leer después', async () => {
    const context = new Response(JSON.stringify({ error: 'x' }), { status: 400 });
    await extractFunctionError({ message: 'm', context });
    await expect(context.json()).resolves.toEqual({ error: 'x' });
  });
});

describe('5.1 · la pantalla del mapa delega en dos hooks', () => {
  const screen = fs.readFileSync(path.join(src, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');

  it('la navegación y el convoy ya no viven en la pantalla', () => {
    expect(screen).toContain('useActiveNavigation({');
    expect(screen).toContain('useConvoySync({');
    for (const moved of ['sharedKeyRef', 'fasterCheckRef', 'lastRerouteAtRef', 'setConvoyProgress', 'shouldShareMyDestination']) {
      expect(screen).not.toContain(moved);
    }
    expect(read('hooks/useActiveNavigation.ts')).toContain('FASTER_ROUTE_EVERY_MS = 3 * 60_000');
    expect(read('hooks/useConvoySync.ts')).toContain('setConvoyProgress({');
  });
});
