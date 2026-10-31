import { beforeAll, describe, expect, it } from '@jest/globals';

import {
  applyMemberPatches,
  changesMembership,
  queueMemberPatch,
  type MemberPatch,
} from '@/src/lib/party-patch';
import {
  matchesSubscription,
  partySubscriptions,
  type RealtimeSubscription,
  type RealtimeTable,
} from '@/src/lib/realtime-routing';

// Ciudad simulada: 1.000 personas usando la app a la vez, repartidas en
// muchas parties de distintos tamaños y gente conduciendo sola. El
// «servidor» reparte cada cambio a los teléfonos cuya suscripción coincide
// (mismas reglas que useParty) y cada teléfono lo procesa con el mismo
// código que la app: parchea posiciones cada segundo y recarga la party si
// alguien entra o sale.

const USERS = 1_000;
const MINUTES = 10;
const BEAT_S = 5; // cada miembro de una party publica su posición cada 5 s
const FLUSH_S = 1;

type MemberRow = {
  party_id: string;
  user_id: string;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  is_muted: boolean;
  voice_channel_slug: string;
  left_at: string | null;
};
type PartyRow = { id: string; name: string; status: string; destination_label: string | null };

type MemberView = {
  userId: string;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
  isMuted: boolean;
  voiceChannelSlug: string;
};

type Phone = {
  userId: string;
  partyId: string | null;
  subscriptions: RealtimeSubscription[];
  view: { name: string; destination: string | null; members: MemberView[] } | null;
  queue: Map<string, MemberPatch>;
  received: number;
  refetches: number;
  renders: number;
  maxPerSecond: number;
  thisSecond: number;
  foreignMessages: number;
};

let seed = 11;
function random() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// --- Servidor --------------------------------------------------------------

const parties = new Map<string, PartyRow>();
const members = new Map<string, MemberRow>(); // clave party:user
const phones = new Map<string, Phone>();
let clock = 0;
let deliveredNew = 0;
let deliveredOld = 0; // reparto con la suscripción antigua (sin filtro)

function activeMembers(partyId: string) {
  return [...members.values()].filter((row) => row.party_id === partyId && !row.left_at);
}

function fetchView(phone: Phone) {
  phone.refetches += 1;
  phone.renders += 1;
  if (!phone.partyId) {
    phone.view = null;
    return;
  }
  const party = parties.get(phone.partyId)!;
  phone.view = {
    name: party.name,
    destination: party.destination_label,
    members: activeMembers(phone.partyId).map((row) => ({
      userId: row.user_id,
      lastLat: row.last_lat,
      lastLng: row.last_lng,
      lastSeenAt: row.last_seen_at,
      isMuted: row.is_muted,
      voiceChannelSlug: row.voice_channel_slug,
    })),
  };
}

// Mismo manejo que el handler de useParty.
function deliver(
  phone: Phone,
  table: RealtimeTable,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Record<string, unknown>,
) {
  phone.received += 1;
  phone.thisSecond += 1;
  const own =
    table === 'parties' ? row.id === phone.partyId : row.party_id === phone.partyId || row.user_id === phone.userId;
  if (!own) phone.foreignMessages += 1;
  if (event !== 'UPDATE' || !phone.partyId) {
    phone.partyId = currentPartyOf(phone.userId);
    phone.subscriptions = partySubscriptions(phone.userId, phone.partyId);
    fetchView(phone);
    return;
  }
  if (table === 'parties') {
    if (phone.view) {
      phone.view = { ...phone.view, name: String(row.name), destination: (row.destination_label as string) ?? null };
      phone.renders += 1;
    }
    return;
  }
  const patch = row as unknown as MemberPatch;
  if (!phone.view || changesMembership(patch, phone.view.members)) {
    phone.partyId = currentPartyOf(phone.userId);
    phone.subscriptions = partySubscriptions(phone.userId, phone.partyId);
    fetchView(phone);
  } else {
    queueMemberPatch(phone.queue, patch);
  }
}

function broadcast(table: RealtimeTable, event: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>) {
  deliveredOld += phones.size; // antes: a todos los teléfonos
  for (const phone of phones.values()) {
    if (phone.subscriptions.some((sub) => matchesSubscription(sub, table, row))) {
      deliveredNew += 1;
      deliver(phone, table, event, row);
    }
  }
}

function currentPartyOf(userId: string) {
  for (const row of members.values()) if (row.user_id === userId && !row.left_at) return row.party_id;
  return null;
}

function join(userId: string, partyId: string) {
  const key = `${partyId}:${userId}`;
  const existing = members.get(key);
  const row: MemberRow = {
    party_id: partyId,
    user_id: userId,
    last_lat: 18.47 + random() * 0.05,
    last_lng: -69.95 + random() * 0.1,
    last_seen_at: null,
    is_muted: false,
    voice_channel_slug: 'convoy',
    left_at: null,
  };
  members.set(key, row);
  broadcast('party_members', existing ? 'UPDATE' : 'INSERT', { ...row });
}

function leave(userId: string) {
  const partyId = currentPartyOf(userId);
  if (!partyId) return;
  const row = members.get(`${partyId}:${userId}`)!;
  row.left_at = new Date(clock * 1000).toISOString();
  row.last_lat = null;
  row.last_lng = null;
  broadcast('party_members', 'UPDATE', { ...row });
}

function move(row: MemberRow) {
  row.last_lat = (row.last_lat ?? 18.48) + (random() - 0.5) * 0.001;
  row.last_lng = (row.last_lng ?? -69.93) + (random() - 0.5) * 0.001;
  row.last_seen_at = new Date(clock * 1000).toISOString();
  broadcast('party_members', 'UPDATE', { ...row });
}

// --- La ciudad -------------------------------------------------------------

const SIZES = [2, 2, 3, 3, 4, 4, 5, 6, 8, 10, 12, 15, 20, 30, 45];
const report: string[] = [];
let partySizes: number[] = [];
let soloUsers = 0;

describe('ciudad con 1.000 usuarios en muchas parties', () => {
  beforeAll(() => {
    // Reparto inicial: parties de tamaños variados; el resto conduce solo.
    let next = 0;
    let index = 0;
    while (next < USERS * 0.82) {
      const size = Math.min(SIZES[index % SIZES.length], USERS - next);
      const id = `p${index}`;
      parties.set(id, { id, name: `Party ${index}`, status: 'live', destination_label: null });
      for (let k = 0; k < size; k += 1) {
        members.set(`${id}:u${next + k}`, {
          party_id: id,
          user_id: `u${next + k}`,
          last_lat: 18.47 + random() * 0.05,
          last_lng: -69.95 + random() * 0.1,
          last_seen_at: null,
          is_muted: false,
          voice_channel_slug: 'convoy',
          left_at: null,
        });
      }
      partySizes.push(size);
      next += size;
      index += 1;
    }
    soloUsers = USERS - next;
    for (let u = 0; u < USERS; u += 1) {
      const userId = `u${u}`;
      const partyId = currentPartyOf(userId);
      const phone: Phone = {
        userId,
        partyId,
        subscriptions: partySubscriptions(userId, partyId),
        view: null,
        queue: new Map(),
        received: 0,
        refetches: 0,
        renders: 0,
        maxPerSecond: 0,
        thisSecond: 0,
        foreignMessages: 0,
      };
      fetchView(phone);
      phone.refetches = 0;
      phone.renders = 0;
      phones.set(userId, phone);
    }

    // 10 minutos de uso, segundo a segundo.
    for (clock = 0; clock < MINUTES * 60; clock += 1) {
      for (const row of [...members.values()]) {
        const n = Number(row.user_id.slice(1));
        if (!row.left_at && (clock + n) % BEAT_S === 0) move(row);
      }
      // Cada minuto: gente que se une, que se va, que cambia de party, un
      // anfitrión que cambia el destino y alguien que se silencia.
      if (clock % 60 === 30) {
        for (let k = 0; k < 8; k += 1) {
          const user = `u${Math.floor(random() * USERS)}`;
          const target = `p${Math.floor(random() * parties.size)}`;
          if (currentPartyOf(user) !== target) {
            leave(user);
            join(user, target);
          }
        }
        for (let k = 0; k < 5; k += 1) leave(`u${Math.floor(random() * USERS)}`);
        const party = parties.get(`p${Math.floor(random() * parties.size)}`)!;
        party.destination_label = `Destino ${clock}`;
        broadcast('parties', 'UPDATE', { ...party });
        const muted = [...members.values()].find((row) => !row.left_at && !row.is_muted);
        if (muted) {
          muted.is_muted = true;
          broadcast('party_members', 'UPDATE', { ...muted });
        }
      }
      // Fin del segundo: cada teléfono aplica lo acumulado (un repintado).
      if (clock % FLUSH_S === 0) {
        for (const phone of phones.values()) {
          phone.maxPerSecond = Math.max(phone.maxPerSecond, phone.thisSecond);
          phone.thisSecond = 0;
          if (phone.view && phone.queue.size) {
            const next = applyMemberPatches(phone.view.members, phone.queue);
            phone.queue.clear();
            if (next !== phone.view.members) {
              phone.view = { ...phone.view, members: next };
              phone.renders += 1;
            }
          }
        }
      }
    }
    for (const phone of phones.values()) {
      if (phone.view && phone.queue.size) {
        phone.view = { ...phone.view, members: applyMemberPatches(phone.view.members, phone.queue) };
        phone.queue.clear();
      }
    }

    const all = [...phones.values()];
    const seconds = MINUTES * 60;
    const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const biggest = Math.max(...partySizes);
    const inBiggest = all.filter((phone) => phone.partyId && activeMembers(phone.partyId).length >= biggest - 2);
    report.push(
      `${USERS} usuarios: ${partySizes.length} parties (2-${biggest} personas) y ${soloUsers} solos, ${MINUTES} min`,
      `Mensajes repartidos: antes ${(deliveredOld / seconds).toFixed(0)}/s, ahora ${(deliveredNew / seconds).toFixed(0)}/s`,
      `Por teléfono: antes ~${(deliveredOld / USERS / seconds).toFixed(0)}/s cada uno; ahora media ${(avg(all.map((p) => p.received)) / seconds).toFixed(2)}/s, máx ${Math.max(...all.map((p) => p.maxPerSecond))}/s`,
      `Party más grande (${biggest}): ${(avg(inBiggest.map((p) => p.received)) / seconds).toFixed(1)} mensajes/s, ${avg(inBiggest.map((p) => p.renders)).toFixed(0)} repintados en ${MINUTES} min`,
      `Recargas por altas/bajas: media ${avg(all.map((p) => p.refetches)).toFixed(2)} por teléfono`,
    );
    console.log(report.join('\n'));
  }, 120_000);

  it('cada teléfono recibe solo lo de su party (nada de otras)', () => {
    for (const phone of phones.values()) expect(phone.foreignMessages).toBe(0);
  });

  it('los que conducen solos no reciben nada de las parties', () => {
    const solos = [...phones.values()].filter((phone) => !phone.partyId && phone.refetches === 0);
    expect(solos.length).toBeGreaterThan(0);
    for (const phone of solos) expect(phone.received).toBe(0);
  });

  it('cada teléfono ve su party exactamente como está en el servidor', () => {
    for (const phone of phones.values()) {
      const expected = phone.partyId ? activeMembers(phone.partyId) : [];
      expect(phone.partyId).toBe(currentPartyOf(phone.userId));
      if (!phone.partyId) continue;
      const view = phone.view!;
      expect(view.members.map((m) => m.userId).sort()).toEqual(expected.map((m) => m.user_id).sort());
      for (const member of view.members) {
        const row = members.get(`${phone.partyId}:${member.userId}`)!;
        expect(member.lastLat).toBe(row.last_lat);
        expect(member.isMuted).toBe(row.is_muted);
      }
      expect(view.destination).toBe(parties.get(phone.partyId)!.destination_label);
    }
  });

  it('quien sale de una party desaparece de la lista de los demás', () => {
    const left = [...members.values()].filter((row) => row.left_at);
    expect(left.length).toBeGreaterThan(0);
    for (const row of left) {
      for (const other of activeMembers(row.party_id)) {
        const view = phones.get(other.user_id)!.view!;
        if (row.user_id !== other.user_id && currentPartyOf(row.user_id) !== row.party_id) {
          expect(view.members.some((m) => m.userId === row.user_id)).toBe(false);
        }
      }
    }
  });

  it('la carga por teléfono es baja incluso en la party más grande', () => {
    const all = [...phones.values()];
    // Party de 45: ~9 mensajes/s como mucho y un repintado por segundo.
    expect(Math.max(...all.map((phone) => phone.maxPerSecond))).toBeLessThanOrEqual(15);
    for (const phone of all) expect(phone.renders).toBeLessThanOrEqual(MINUTES * 60 + 40);
    // Antes cada teléfono recibía todo: ~160 mensajes/s.
    expect(deliveredNew).toBeLessThan(deliveredOld / 20);
  });
});
