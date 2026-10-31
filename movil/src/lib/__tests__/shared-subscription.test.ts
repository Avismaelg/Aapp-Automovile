import { describe, expect, it } from '@jest/globals';

import { acquireSubscription, activeSubscriptionCount } from '@/src/lib/shared-subscription';

describe('suscripción compartida entre pantallas', () => {
  it('tres pantallas con la misma party abren un solo canal y lo cierra la última', () => {
    let opened = 0;
    let closed = 0;
    const start = () => {
      opened += 1;
      return () => {
        closed += 1;
      };
    };
    const releases = [
      acquireSubscription('party:yo:p1', start),
      acquireSubscription('party:yo:p1', start),
      acquireSubscription('party:yo:p1', start),
    ];
    expect(opened).toBe(1);
    releases[0]();
    releases[1]();
    expect(closed).toBe(0);
    releases[2]();
    expect(closed).toBe(1);
    expect(activeSubscriptionCount()).toBe(0);
  });

  it('cambiar de party cierra el canal viejo y abre el nuevo', () => {
    const log: string[] = [];
    const start = (key: string) => () => {
      log.push(`abre ${key}`);
      return () => log.push(`cierra ${key}`);
    };
    const release = acquireSubscription('party:yo:p1', start('p1'));
    release();
    acquireSubscription('party:yo:p2', start('p2'))();
    expect(log).toEqual(['abre p1', 'cierra p1', 'abre p2', 'cierra p2']);
  });
});
