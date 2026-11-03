/// <reference types="node" />
import { describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { LIVE_POLL_MS, livePollInterval } from '@/src/hooks/useLivePoll';

// jest.mock se eleva sobre los imports: el hook usa este contexto falso.
jest.mock('expo-router/build/react-navigation/core/useIsFocused', () => {
  const { createContext } = jest.requireActual<typeof import('react')>('react');
  return { IsFocusedContext: createContext<boolean | undefined>(undefined) };
});

const root = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('SYNC-03: respaldo de 5 s solo en la pantalla visible', () => {
  it('sondea cada 5 s si la pantalla está a la vista (o fuera de una pantalla)', () => {
    expect(LIVE_POLL_MS).toBe(5_000);
    expect(livePollInterval(true)).toBe(5_000);
    expect(livePollInterval(undefined)).toBe(5_000);
  });

  it('una pestaña montada pero oculta no sondea', () => {
    expect(livePollInterval(false)).toBe(false);
  });

  it('los datos que cambian usan el sondeo de pantalla', () => {
    for (const hook of [
      'useFriends',
      'useFriendsOnMap',
      'useParty',
      'usePartyInvites',
      'useChallenges',
      'useFeed',
      'useGarage',
      'useProfile',
      'useEvents',
    ]) {
      const source = read(`src/hooks/${hook}.ts`);
      expect(source).toContain('useLivePoll()');
      expect(source).not.toMatch(/refetchInterval: 15_000/);
    }
  });
});

describe('SYNC-04 / SYNC-05: volver a la app, a la red y deslizar para recargar', () => {
  it('la app avisa a TanStack del foco y de la conexión', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toContain('focusManager.setEventListener');
    expect(layout).toContain('onlineManager.setEventListener');
    expect(layout).toContain('NetInfo.addEventListener');
    expect(layout).toContain('<ConnectionBanner />');
  });

  it('toda pantalla con scroll se recarga al deslizar', () => {
    const ui = read('src/components/ui.tsx');
    expect(ui).toContain('<RefreshControl');
    expect(ui).toContain("refetchQueries({ type: 'active' })");
  });
});
