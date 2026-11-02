import { shortMonths, t } from "@/src/i18n";
export type EventRoute = {
  coordinates: [number, number][];
  distanceM: number;
  timeMs: number;
};

export type AppEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  hostName: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  route: EventRoute | null;
  createdAt: string;
  isLocal: boolean;
  pendingSync?: boolean;
};

const MONTHS = shortMonths();

export function eventId() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatEventDate(iso: string | null) {
  if (!iso) return t('Sin fecha');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('Sin fecha');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${hours}:${minutes}`;
}

// RF-17: fecha y hora del evento escritas como «AAAA-MM-DD» y «HH:MM» (hora
// local). Se rechazan formatos inválidos y fechas pasadas.
export function parseEventStart(
  date: string,
  time: string,
  now = Date.now(),
): { ok: true; iso: string } | { ok: false; error: string } {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return { ok: false, error: t('Usa una fecha con formato AAAA-MM-DD.') };
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim() || '00:00');
  if (!timeMatch) return { ok: false, error: t('Usa una hora con formato HH:MM.') };
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  const start = new Date(year, month - 1, day, hours, minutes);
  const valid =
    start.getFullYear() === year &&
    start.getMonth() === month - 1 &&
    start.getDate() === day &&
    hours < 24 &&
    minutes < 60;
  if (!valid) return { ok: false, error: t('Esa fecha no existe.') };
  if (start.getTime() < now) return { ok: false, error: t('La fecha del evento ya pasó. Elige una fecha futura.') };
  return { ok: true, iso: start.toISOString() };
}
