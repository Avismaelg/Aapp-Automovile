import { displayKm, distanceUnit, getCurrency, getLocale, t } from "@/src/i18n";
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatKm(meters: number) {
  const km = meters / 1000;
  return `${displayKm(km, km < 10 ? 1 : 0)} ${distanceUnit()}`;
}

export function formatMoney(value: number, currency = getCurrency()) {
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${formatNumber(value, 0)}`;
  }
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return t('{0} h {1} min', h, m);
  return `${m} min`;
}

export function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('ahora');
  if (mins < 60) return t('hace {0} min', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('hace {0} h', hours);
  const days = Math.floor(hours / 24);
  return t('hace {0} d', days);
}
