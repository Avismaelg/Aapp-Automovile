import { useEffect, useState } from 'react';

import { AppText } from '@/src/components/ui';
import { formatClock } from '@/src/lib/format';
import { colors } from '@/src/theme';

// Reloj con su propio temporizador: así el resto de la pantalla (mapa
// incluido) no se vuelve a renderizar cada segundo.
export function ElapsedClock({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);

  const seconds = since == null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
  return (
    <AppText variant="mono" color={colors.text} style={{ fontSize: 17 }}>
      {formatClock(seconds)}
    </AppText>
  );
}
