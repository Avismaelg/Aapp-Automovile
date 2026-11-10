import { useEffect, useState } from 'react';

import { STOPPED_KMH } from '@/src/lib/arrival';

// true cuando llevas `ms` por debajo de 5 km/h (parado o aparcando).
export function useStoppedFor(speedKmh: number | null | undefined, ms: number) {
  const [stopped, setStopped] = useState(false);
  const moving = speedKmh != null && speedKmh >= STOPPED_KMH;
  useEffect(() => {
    // Siempre desde un temporizador: el estado no cambia en el cuerpo del efecto.
    const timer = setTimeout(() => setStopped(!moving), moving ? 0 : ms);
    return () => clearTimeout(timer);
  }, [moving, ms]);
  return stopped;
}
