import { useEffect, useState } from 'react';

// Hora actual que se renueva cada `intervalMs` (para caducar datos viejos en
// pantalla sin llamar a Date.now() durante el render).
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
