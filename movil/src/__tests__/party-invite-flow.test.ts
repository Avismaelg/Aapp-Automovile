import { describe, expect, it } from '@jest/globals';

import {
  extractPartyCode,
  inviteErrorMessage,
  inviteMessage,
  inviteStateFor,
  lastSeenLabel,
  latestFriendPositions,
  shouldPushFriendLocation,
  sortInviteCandidates,
  type SentInvite,
} from '@/src/lib/party-invites';
import { parseCaravanaUrl, partyUrl } from '@/src/lib/qr';

// Servidor de mentira con las mismas reglas que la migración
// 20261031120000_party_invites_friend_locations.sql: invitar solo a amigos,
// aceptar te mete en la party y te saca de las demás, y cada uno ve la
// posición de sus amigos (no la de desconocidos).
class FakeServer {
  friendships = new Set<string>();
  parties = new Map<string, { id: string; code: string; name: string; max: number; live: boolean }>();
  members = new Map<string, Set<string>>(); // partyId → userIds activos
  invites: { id: string; partyId: string; partyName: string; inviter: string; invitee: string; status: SentInvite['status'] }[] = [];
  locations = new Map<string, { lat: number; lng: number; at: string }>();
  private seq = 0;

  befriend(a: string, b: string) {
    this.friendships.add([a, b].sort().join('|'));
  }
  areFriends(a: string, b: string) {
    return this.friendships.has([a, b].sort().join('|'));
  }
  activeParty(user: string) {
    for (const [partyId, users] of this.members) {
      if (users.has(user) && this.parties.get(partyId)?.live) return this.parties.get(partyId)!;
    }
    return null;
  }
  leaveAll(user: string, except?: string) {
    for (const [partyId, users] of this.members) if (partyId !== except) users.delete(user);
  }
  createParty(host: string, name: string) {
    this.leaveAll(host);
    const id = `p${++this.seq}`;
    const code = `C${String(this.seq).padStart(5, '0')}`;
    this.parties.set(id, { id, code, name, max: 50, live: true });
    this.members.set(id, new Set([host]));
    return { id, code };
  }
  inviteToParty(caller: string, partyId: string, user: string) {
    const party = this.parties.get(partyId);
    if (!this.members.get(partyId)?.has(caller)) throw new Error('not_a_member');
    if (!party?.live) throw new Error('party_not_found');
    if (!this.areFriends(caller, user)) throw new Error('not_friends');
    if (this.members.get(partyId)!.has(user)) throw new Error('already_member');
    const existing = this.invites.find((i) => i.partyId === partyId && i.invitee === user);
    if (existing) {
      existing.status = 'pending';
      existing.inviter = caller;
      return existing.id;
    }
    const id = `i${++this.seq}`;
    this.invites.push({ id, partyId, partyName: party.name, inviter: caller, invitee: user, status: 'pending' });
    return id;
  }
  incoming(user: string) {
    return this.invites.filter((i) => i.invitee === user && i.status === 'pending');
  }
  accept(caller: string, inviteId: string) {
    const invite = this.invites.find((i) => i.id === inviteId && i.invitee === caller && i.status === 'pending');
    if (!invite) throw new Error('invite_not_found');
    const party = this.parties.get(invite.partyId);
    if (!party?.live) throw new Error('party_not_found');
    if (this.members.get(party.id)!.size >= party.max) throw new Error('party_full');
    this.leaveAll(caller, party.id);
    this.members.get(party.id)!.add(caller);
    invite.status = 'accepted';
  }
  joinByCode(caller: string, code: string) {
    const party = [...this.parties.values()].find((p) => p.code === code && p.live);
    if (!party) throw new Error('party_not_found');
    this.leaveAll(caller, party.id);
    this.members.get(party.id)!.add(caller);
    return party;
  }
  shareLocation(user: string, lat: number, lng: number, at: number) {
    this.locations.set(user, { lat, lng, at: new Date(at).toISOString() });
  }
  // RLS de friend_locations: la tuya y la de tus amigos.
  visibleLocations(viewer: string, ids: string[]) {
    return ids
      .filter((id) => id === viewer || this.areFriends(viewer, id))
      .flatMap((id) => {
        const row = this.locations.get(id);
        return row ? [{ userId: id, lat: row.lat, lng: row.lng, at: row.at }] : [];
      });
  }
}

const NOW = Date.parse('2026-10-31T15:00:00Z');

describe('añadir gente al convoy', () => {
  it('invitar a un amigo con un toque: le llega, acepta y entra', () => {
    const server = new FakeServer();
    server.befriend('yo', 'laura');
    // Sin party: invitar la crea.
    const created = server.createParty('yo', 'Convoy de Ismael');
    server.inviteToParty('yo', created.id, 'laura');

    const inbox = server.incoming('laura');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].partyName).toBe('Convoy de Ismael');

    // Mi lista marca a Laura como «Invitado».
    const sent = server.invites.map((i) => ({ inviteeId: i.invitee, status: i.status }));
    expect(inviteStateFor('laura', [...server.members.get(created.id)!], sent)).toBe('invited');

    server.accept('laura', inbox[0].id);
    expect(server.activeParty('laura')?.id).toBe(created.id);
    expect(server.incoming('laura')).toHaveLength(0);
    const after = server.invites.map((i) => ({ inviteeId: i.invitee, status: i.status }));
    expect(inviteStateFor('laura', [...server.members.get(created.id)!], after)).toBe('member');
  });

  it('no se puede invitar a desconocidos ni a quien ya está', () => {
    const server = new FakeServer();
    server.befriend('yo', 'laura');
    const { id } = server.createParty('yo', 'Convoy');
    expect(() => server.inviteToParty('yo', id, 'extraño')).toThrow('not_friends');
    expect(inviteErrorMessage('not_friends')).toBe('Solo puedes invitar a tus amigos.');
    server.inviteToParty('yo', id, 'laura');
    server.accept('laura', server.incoming('laura')[0].id);
    expect(() => server.inviteToParty('yo', id, 'laura')).toThrow('already_member');
    // Alguien de fuera de la party no puede invitar a ella.
    server.befriend('pedro', 'marta');
    expect(() => server.inviteToParty('pedro', id, 'marta')).toThrow('not_a_member');
  });

  it('aceptar te saca de tu party anterior (solo una activa)', () => {
    const server = new FakeServer();
    server.befriend('yo', 'laura');
    const mine = server.createParty('laura', 'Party vieja');
    const other = server.createParty('yo', 'Convoy nuevo');
    expect(server.activeParty('laura')?.id).toBe(mine.id);
    server.inviteToParty('yo', other.id, 'laura');
    server.accept('laura', server.incoming('laura')[0].id);
    expect(server.activeParty('laura')?.id).toBe(other.id);
    expect(server.members.get(mine.id)!.has('laura')).toBe(false);
  });

  it('reinvitar a quien dijo «ahora no» le vuelve a llegar', () => {
    const server = new FakeServer();
    server.befriend('yo', 'laura');
    const { id } = server.createParty('yo', 'Convoy');
    server.inviteToParty('yo', id, 'laura');
    server.invites[0].status = 'declined';
    expect(server.incoming('laura')).toHaveLength(0);
    server.inviteToParty('yo', id, 'laura');
    expect(server.incoming('laura')).toHaveLength(1);
  });

  it('la lista pone primero a quien falta por invitar', () => {
    const list = sortInviteCandidates(
      [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Bea' },
        { id: 'c', name: 'Carlos' },
      ],
      ['a'],
      [{ inviteeId: 'b', status: 'pending' }],
    );
    expect(list.map((f) => [f.id, f.state])).toEqual([
      ['c', 'invite'],
      ['b', 'invited'],
      ['a', 'member'],
    ]);
  });
});

describe('unirse con código o enlace', () => {
  it('el mensaje de WhatsApp lleva el código y se puede pegar entero', () => {
    const server = new FakeServer();
    const { code } = server.createParty('yo', 'Convoy de Ismael');
    const message = inviteMessage('Convoy de Ismael', code);
    expect(message).toContain(`Código: ${code}`);
    // El amigo copia el mensaje completo y pulsa «Pegar invitación».
    const pasted = extractPartyCode(message);
    expect(pasted).toBe(code);
    expect(server.joinByCode('laura', pasted!).name).toBe('Convoy de Ismael');
  });

  it('acepta el código suelto, en minúsculas, o cualquier forma del enlace', () => {
    expect(extractPartyCode('abc123')).toBe('ABC123');
    expect(extractPartyCode('  K7P2QX ')).toBe('K7P2QX');
    expect(extractPartyCode('https://x.github.io/caravana/p/?c=k7p2qx')).toBe('K7P2QX');
    expect(extractPartyCode('https://caravana.app/p/K7P2QX')).toBe('K7P2QX');
    expect(extractPartyCode('codigo k7p2qx')).toBe('K7P2QX');
    expect(extractPartyCode('hola, ¿vienes?')).toBeNull();
    expect(extractPartyCode('')).toBeNull();
  });

  it('el QR y el enlace abren la pantalla de unirse', () => {
    expect(parseCaravanaUrl(partyUrl('k7p2qx'))).toEqual({ kind: 'party', id: 'K7P2QX' });
    expect(parseCaravanaUrl('https://x.github.io/caravana/p/?c=K7P2QX')).toEqual({
      kind: 'party',
      id: 'K7P2QX',
    });
  });
});

describe('amigos en el mapa', () => {
  it('ves a tu amigo aunque no estéis en la misma party', () => {
    const server = new FakeServer();
    server.befriend('yo', 'laura');
    server.shareLocation('laura', 18.47, -69.9, NOW - 30_000);
    server.shareLocation('extraño', 18.46, -69.91, NOW - 30_000);

    const visible = server.visibleLocations('yo', ['laura', 'extraño']);
    const positions = latestFriendPositions(visible, NOW);
    expect([...positions.keys()]).toEqual(['laura']);
    expect(lastSeenLabel(positions.get('laura')!.updatedAt, NOW)).toBe('En vivo');
  });

  it('gana la posición más reciente entre la compartida y la de la party', () => {
    const positions = latestFriendPositions(
      [
        { userId: 'laura', lat: 1, lng: 1, at: new Date(NOW - 10 * 60_000).toISOString() },
        { userId: 'laura', lat: 2, lng: 2, at: new Date(NOW - 20_000).toISOString() },
        { userId: 'pedro', lat: 3, lng: 3, at: new Date(NOW - 13 * 3_600_000).toISOString() },
        { userId: 'marta', lat: null, lng: null, at: new Date(NOW).toISOString() },
      ],
      NOW,
    );
    expect(positions.get('laura')?.latitude).toBe(2);
    // Más de 12 h sin compartir: ya no se muestra.
    expect(positions.has('pedro')).toBe(false);
    expect(positions.has('marta')).toBe(false);
  });

  it('etiqueta de hace cuánto', () => {
    expect(lastSeenLabel(NOW - 7 * 60_000, NOW)).toBe('Hace 7 min');
    expect(lastSeenLabel(NOW - 3 * 3_600_000, NOW)).toBe('Hace 3 h');
  });

  it('una hora conduciendo sube pocas posiciones', () => {
    // 1 punto por segundo a 60 km/h durante una hora.
    let last: { lat: number; lng: number; at: number } | null = null;
    let pushes = 0;
    for (let s = 0; s < 3600; s += 1) {
      const next = { lat: 18.4 + (s * 16.7) / 111_320, lng: -69.9, at: NOW + s * 1000 };
      if (shouldPushFriendLocation(last, next)) {
        pushes += 1;
        last = next;
      }
    }
    // Una cada 5 s (casi en vivo): 720 escrituras por hora en vez de 3.600.
    expect(pushes).toBeLessThanOrEqual(721);
    expect(pushes).toBeGreaterThanOrEqual(700);

    // Parado en casa una hora: una por minuto (sigue «en vivo» para los demás).
    last = null;
    pushes = 0;
    for (let s = 0; s < 3600; s += 1) {
      const next = { lat: 18.4, lng: -69.9, at: NOW + s * 1000 };
      if (shouldPushFriendLocation(last, next)) {
        pushes += 1;
        last = next;
      }
    }
    expect(pushes).toBe(60);
  });
});
