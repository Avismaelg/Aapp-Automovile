/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { membersMoved } from '@/src/hooks/useSmoothMembers';

// Fase 3: batería y temporizadores.

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
const friend = (id: string, latitude: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  color: '#fff',
  latitude,
  longitude: -69.93,
  ...extra,
});

describe('3.3 · el mapa no anima si nadie se mueve', () => {
  it('mismas posiciones (aunque sea otro array y cambie el resto) → sin animación', () => {
    const before = [friend('a', 18.48), friend('b', 18.49)];
    const after = [friend('b', 18.49, { stale: true }), friend('a', 18.48, { isTalking: true })];
    expect(membersMoved(before, after)).toBe(false);
  });

  it('alguien se mueve, entra o sale → se anima', () => {
    const before = [friend('a', 18.48), friend('b', 18.49)];
    expect(membersMoved(before, [friend('a', 18.481), friend('b', 18.49)])).toBe(true);
    expect(membersMoved(before, [friend('a', 18.48)])).toBe(true);
    expect(membersMoved(before, [friend('a', 18.48), friend('c', 18.49)])).toBe(true);
  });

  it('los amigos ya no renuevan la hora en cada consulta', () => {
    const source = read('src/hooks/useFriendsOnMap.ts');
    expect(source).not.toContain('setNow(');
    expect(source).toContain('useNow(30_000)');
  });
});

describe('3.1 · compartir con amigos no deja el GPS encendido todo el día', () => {
  it('el servicio fijo es solo del convoy; el de amigos nunca se enciende', () => {
    const source = read('src/lib/tracking.ts');
    expect(source).not.toContain("startDriving('friends')");
    expect(source).toContain("stopDriving('friends')");
    expect(source).toContain("if (updatesRunning && convoyMode) startDriving('convoy')");
  });
});

describe('3.2, 3.4, 3.5 · sensores y relojes en pausa', () => {
  it('el GPS del mapa y la brújula se paran en segundo plano salvo navegando', () => {
    const source = read('src/hooks/useLiveLocation.ts');
    expect(source).toContain("if (state === 'background') pauseForBackground()");
    expect(source).toContain('useChosenDestination.getState().isNavigating && activeWatch');
  });

  it('con el permiso concedido no se sigue preguntando', () => {
    expect(read('src/components/WorldMap.tsx')).toContain('if (granted) return;');
  });

  it('el reloj del reto solo corre con Retos a la vista y el emparejamiento se cancela', () => {
    const source = read('src/hooks/useChallengeScreen.ts');
    expect(source).toContain('useLivePoll(1_000)');
    expect(source).toContain('matchTimerRef.current = setTimeout(');
    expect(source).toContain('clearTimeout(matchTimerRef.current)');
  });
});
