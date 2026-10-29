import { useEffect, useState } from 'react';

import { mapThemeAt, type MapTheme } from '@/src/lib/daylight';

// Día o noche según el sol en tu posición; se revisa cada minuto. La posición
// se redondea (~10 km) para no recalcular con cada señal GPS.
export function useMapTheme(location: { latitude: number; longitude: number }): MapTheme {
  const latitude = Math.round(location.latitude * 10) / 10;
  const longitude = Math.round(location.longitude * 10) / 10;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return mapThemeAt(now, latitude, longitude);
}
