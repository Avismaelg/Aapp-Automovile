import { useEffect, useRef, useState } from 'react';

import { interpolatePoint } from '@/src/lib/convoy';
import type { WorldMapMember } from '@/src/lib/map-html';

const DURATION_MS = 1_200;
const FRAME_MS = 80;
// Con muchísimos pilotos (prueba de carga) no se anima: se pinta tal cual.
const MAX_ANIMATED = 60;

// Las posiciones de la party llegan cada ~3 s. En vez de saltar de golpe,
// cada punto se desliza hasta su nueva posición.
export function useSmoothMembers(members: WorldMapMember[]): WorldMapMember[] {
  const [frame, setFrame] = useState<{ source: WorldMapMember[]; shown: WorldMapMember[] }>({
    source: members,
    shown: members,
  });
  const shownRef = useRef(members);
  const animate = members.length <= MAX_ANIMATED;

  useEffect(() => {
    if (!animate) {
      shownRef.current = members;
      return;
    }
    const from = new Map(shownRef.current.map((member) => [member.id, member]));
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const t = (Date.now() - startedAt) / DURATION_MS;
      const shown = members.map((member) => {
        const previous = from.get(member.id);
        if (!previous) return member;
        const point = interpolatePoint(previous, member, t);
        return { ...member, latitude: point.latitude, longitude: point.longitude };
      });
      shownRef.current = shown;
      setFrame({ source: members, shown });
      if (t >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [animate, members]);

  if (!animate) return members;
  // Hasta el primer fotograma: los que no se movían se quedan donde estaban
  // (los nuevos aparecen ya en su sitio).
  if (frame.source !== members) {
    const previous = new Map(frame.shown.map((member) => [member.id, member]));
    return members.map((member) => {
      const old = previous.get(member.id);
      return old ? { ...member, latitude: old.latitude, longitude: old.longitude } : member;
    });
  }
  return frame.shown;
}
