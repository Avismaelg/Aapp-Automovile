import { describe, expect, it } from '@jest/globals';

import { applyMemberPatches, queueMemberPatch, type MemberPatch } from '@/src/lib/party-patch';

const USERS = 1_000;
const BEAT_S = 5; // cada miembro manda su posición cada 5 s
const SECONDS = 60;

function party() {
  return Array.from({ length: USERS }, (_, index) => ({
    userId: `u${index}`,
    lastLat: 18.48,
    lastLng: -69.93,
    lastSeenAt: null as string | null,
    isMuted: false,
    voiceChannelSlug: 'convoy',
    name: `Piloto ${index}`,
  }));
}

// Mensajes de tiempo real de un minuto: 1.000 usuarios, uno cada 5 s.
function messages() {
  const out: { second: number; row: MemberPatch }[] = [];
  for (let second = 0; second < SECONDS; second += 1) {
    for (let user = second % BEAT_S; user < USERS; user += BEAT_S) {
      out.push({
        second,
        row: {
          user_id: `u${user}`,
          last_lat: 18.48 + second * 0.0001,
          last_lng: -69.93,
          last_seen_at: new Date(second * 1_000).toISOString(),
        },
      });
    }
  }
  return out;
}

describe('party de 1.000 usuarios en tiempo real', () => {
  it('agrupa los cambios: un repintado por segundo en vez de uno por mensaje', () => {
    const stream = messages();
    expect(stream.length).toBe((USERS / BEAT_S) * SECONDS); // 12.000 mensajes

    // Antes: cada mensaje recorría la lista y provocaba un repintado.
    let before = party();
    let renderBefore = 0;
    const t0 = performance.now();
    for (const { row } of stream) {
      before = applyMemberPatches(before, new Map([[row.user_id, row]]));
      renderBefore += 1;
    }
    const msBefore = performance.now() - t0;

    // Ahora: se acumulan y se aplican una vez por segundo.
    let after = party();
    let renderAfter = 0;
    const queue = new Map<string, MemberPatch>();
    const t1 = performance.now();
    let second = 0;
    for (const message of stream) {
      if (message.second !== second) {
        after = applyMemberPatches(after, queue);
        queue.clear();
        renderAfter += 1;
        second = message.second;
      }
      queueMemberPatch(queue, message.row);
    }
    after = applyMemberPatches(after, queue);
    renderAfter += 1;
    const msAfter = performance.now() - t1;

    // Mismo resultado final.
    expect(after).toEqual(before);
    expect(renderBefore).toBe(12_000);
    expect(renderAfter).toBe(SECONDS);
    expect(msAfter).toBeLessThan(msBefore);
    console.log(
      `1.000 usuarios, 1 min: antes ${renderBefore} repintados (${msBefore.toFixed(0)} ms de CPU), ` +
        `ahora ${renderAfter} (${msAfter.toFixed(0)} ms)`,
    );
  });

  it('los cambios del mismo usuario se combinan campo a campo', () => {
    const queue = new Map<string, MemberPatch>();
    queueMemberPatch(queue, { user_id: 'u1', last_lat: 1, last_lng: 2 });
    queueMemberPatch(queue, { user_id: 'u1', is_muted: true });
    queueMemberPatch(queue, { user_id: 'u1', last_lat: 3 });
    expect(queue.get('u1')).toEqual({ user_id: 'u1', last_lat: 3, last_lng: 2, is_muted: true });
  });

  it('sin cambios para miembros de la lista no hay repintado', () => {
    const members = party();
    const queue = new Map<string, MemberPatch>([['otro', { user_id: 'otro', last_lat: 1 }]]);
    expect(applyMemberPatches(members, queue)).toBe(members);
  });

  it('null en la posición borra la última conocida', () => {
    const members = party();
    const queue = new Map<string, MemberPatch>([['u0', { user_id: 'u0', last_lat: null }]]);
    expect(applyMemberPatches(members, queue)[0].lastLat).toBeNull();
  });
});
