import { t } from '@/src/i18n';

// REG-01…REG-05: reglas del registro en 3 pasos. Sin React ni Supabase: las
// usan la pantalla de alta y las pruebas. Las mismas reglas están en la base
// de datos (migración 20261103100000), que es la que manda.

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const VEHICLE_MIN_YEAR = 1950;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NICKNAME_PATTERN = /^[a-z0-9_.]+$/;

export function maxVehicleYear(now = new Date()) {
  return now.getFullYear() + 1;
}

// El apodo se escribe como se quiera y se guarda en minúscula sin espacios.
export function normalizeNickname(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
}

export function nameError(value: string, field: 'first' | 'last'): string | null {
  const clean = value.trim();
  if (clean.length < 2) return field === 'first' ? t('Escribe tu nombre.') : t('Escribe tu apellido.');
  if (clean.length > 40) return t('Máximo 40 caracteres.');
  return null;
}

export function nicknameError(value: string): string | null {
  const nick = normalizeNickname(value);
  if (nick.length < NICKNAME_MIN || nick.length > NICKNAME_MAX) {
    return t('Entre {0} y {1} caracteres.', NICKNAME_MIN, NICKNAME_MAX);
  }
  if (!NICKNAME_PATTERN.test(nick)) return t('Solo letras, números, «_» y «.».');
  if (nick.startsWith('.') || nick.endsWith('.') || nick.includes('..')) {
    return t('El punto no puede ir al principio, al final ni repetido.');
  }
  return null;
}

export function emailError(value: string): string | null {
  return EMAIL_PATTERN.test(value.trim()) ? null : t('Escribe un correo válido.');
}

export type PasswordCheck = { length: boolean; letter: boolean; number: boolean };

export function passwordChecks(value: string): PasswordCheck {
  return {
    length: value.length >= PASSWORD_MIN,
    letter: /[A-Za-zÀ-ÿ]/.test(value),
    number: /\d/.test(value),
  };
}

export function passwordError(value: string): string | null {
  const checks = passwordChecks(value);
  if (!checks.length) return t('Usa al menos {0} caracteres.', PASSWORD_MIN);
  if (!checks.letter || !checks.number) return t('Incluye al menos una letra y un número.');
  return null;
}

// 0 (muy débil) … 4 (fuerte).
export function passwordStrength(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) return 0;
  let score = 0;
  if (value.length >= PASSWORD_MIN) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 0.5;
  if (/[^A-Za-z0-9]/.test(value)) score += 0.5;
  if (!passwordChecks(value).length) score = Math.min(score, 1);
  return Math.min(4, Math.floor(score)) as 0 | 1 | 2 | 3 | 4;
}

export function strengthLabel(score: number) {
  return [t('Muy débil'), t('Débil'), t('Aceptable'), t('Buena'), t('Fuerte')][score] ?? '';
}

export function confirmError(password: string, confirm: string): string | null {
  return password === confirm ? null : t('Las contraseñas no coinciden.');
}

export function yearError(value: string, now = new Date()): string | null {
  if (!/^\d{4}$/.test(value.trim())) return t('Escribe el año con 4 cifras.');
  const year = Number(value);
  const max = maxVehicleYear(now);
  if (year < VEHICLE_MIN_YEAR || year > max) return t('Entre {0} y {1}.', VEHICLE_MIN_YEAR, max);
  return null;
}

export function requiredError(value: string, label: string): string | null {
  return value.trim() ? null : t('Escribe {0}.', label);
}

// Paso al que hay que volver si el servidor rechaza algo al final.
export function stepForServerError(message: string): 1 | 2 | 3 {
  const normalized = message.toLowerCase();
  // Mensajes de Supabase (inglés) y los ya traducidos de la app.
  if (/registered|already|email|correo/.test(normalized)) return 1;
  if (/password|contraseña/.test(normalized)) return 2;
  return 3;
}
