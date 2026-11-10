import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { pushLivePosition, setConvoyProgress, setLiveShareConfig } from '@/src/lib/live-share';

// CONV-06: la llegada a la meta del convoy se manda una sola vez. Si esa
// subida falla (cobertura justo al llegar), debe volver a mandarse con la
// siguiente posición; antes se daba por enviada y nadie te veía llegar.

type Update = Record<string, unknown>;
const mockUpdates: Update[] = [];
let mockFailNext = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined },
}));

jest.mock('@/src/lib/supabase', () => {
  const chain = (row: Update) => {
    const result = {
      eq: () => result,
      then: (resolve: (value: { error: { message: string } | null }) => unknown) => {
        mockUpdates.push(row);
        const error = mockFailNext ? { message: 'network' } : null;
        mockFailNext = false;
        return Promise.resolve(resolve({ error }));
      },
    };
    return result;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
      from: () => ({ update: chain, upsert: chain }),
    },
  };
});

const fix = (at: number, latitude: number) => ({ latitude, longitude: -69.93, speedKmh: 0, heading: null, at });

describe('CONV-06: llegada al convoy', () => {
  beforeEach(async () => {
    mockUpdates.length = 0;
    await setLiveShareConfig({ accountId: 'me', partyId: 'party-1', friends: false });
  });

  it('reenvía la llegada si la primera subida falla, y luego no la repite', async () => {
    setConvoyProgress({ etaS: 0, remainingM: 0, arrived: true });

    mockFailNext = true;
    await pushLivePosition(fix(1_000, 18.48));
    await pushLivePosition(fix(60_000, 18.481));
    await pushLivePosition(fix(120_000, 18.482));

    expect(mockUpdates).toHaveLength(3);
    expect(mockUpdates[0]).toHaveProperty('arrived_at');
    expect(mockUpdates[1]).toHaveProperty('arrived_at');
    expect(mockUpdates[2]).not.toHaveProperty('arrived_at');
  });
});
