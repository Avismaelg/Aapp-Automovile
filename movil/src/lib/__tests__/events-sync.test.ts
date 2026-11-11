import { describe, expect, it } from '@jest/globals';

import { syncPendingEvents, type PendingEventLike } from '@/src/lib/events-sync';

type TestEvent = PendingEventLike & { title: string };

function queue(ids: string[]) {
  const state = {
    events: ids.map((id) => ({ id, title: id, pendingSync: true }) as TestEvent),
  };
  const marked: string[] = [];
  return {
    state,
    marked,
    markSynced: (id: string) => {
      marked.push(id);
      state.events = state.events.map((event) =>
        event.id === id ? { ...event, pendingSync: false } : event,
      );
    },
  };
}

describe('cola de eventos pendientes', () => {
  it('un evento rechazado no bloquea a los siguientes', async () => {
    const events = queue(['rechazado', 'bueno-1', 'bueno-2']);
    const inserted: string[] = [];

    const completed = await syncPendingEvents({
      getEvents: () => events.state.events,
      insert: async (event) => {
        inserted.push(event.id);
        return { error: event.id === 'rechazado' ? { code: '23514' } : null };
      },
      markSynced: events.markSynced,
      isSameAccount: () => true,
    });

    expect(completed).toBe(true);
    expect(inserted).toEqual(['rechazado', 'bueno-1', 'bueno-2']);
    expect(events.marked).toEqual(['bueno-1', 'bueno-2']);
    // El rechazado sigue pendiente para reintentarse más adelante, pero ya no
    // vuelve a bloquear la cola en esta pasada.
    expect(events.state.events.find((event) => event.id === 'rechazado')?.pendingSync).toBe(true);
  });

  it('un duplicado (23505) se da por subido sin bloquear', async () => {
    const events = queue(['duplicado', 'nuevo']);

    await syncPendingEvents({
      getEvents: () => events.state.events,
      insert: async (event) => ({ error: event.id === 'duplicado' ? { code: '23505' } : null }),
      markSynced: events.markSynced,
      isSameAccount: () => true,
    });

    expect(events.marked).toEqual(['duplicado', 'nuevo']);
  });

  it('un fallo de red corta la cola sin marcar nada', async () => {
    const events = queue(['sin-red', 'otro']);
    const inserted: string[] = [];

    const completed = await syncPendingEvents({
      getEvents: () => events.state.events,
      insert: async (event) => {
        inserted.push(event.id);
        return { error: {} };
      },
      markSynced: events.markSynced,
      isSameAccount: () => true,
    });

    expect(completed).toBe(false);
    expect(inserted).toEqual(['sin-red']);
    expect(events.marked).toEqual([]);
  });

  it('si cambia la cuenta a media subida no marca el evento de la anterior', async () => {
    const events = queue(['de-otra-cuenta']);
    let sameAccount = true;

    const completed = await syncPendingEvents({
      getEvents: () => events.state.events,
      insert: async () => {
        sameAccount = false;
        return { error: null };
      },
      markSynced: events.markSynced,
      isSameAccount: () => sameAccount,
    });

    expect(completed).toBe(false);
    expect(events.marked).toEqual([]);
    expect(events.state.events[0].pendingSync).toBe(true);
  });
});
