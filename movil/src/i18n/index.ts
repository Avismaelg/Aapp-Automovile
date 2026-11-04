import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import en from '@/src/i18n/en.json';

// Idiomas de Caravana. El español es el texto base (está en el código); el
// resto son diccionarios «texto en español → traducción». t() funciona en
// pantallas y fuera de ellas (avisos, voz, tareas en segundo plano).
//
// El idioma se decide al arrancar, de forma síncrona: la elección guardada en
// Perfil o, en «automático», el del teléfono. Cambiarlo reinicia la app para
// que todo, también lo calculado al arrancar, salga en el idioma nuevo.

export type Language = 'es' | 'en';
export type LanguagePreference = 'auto' | Language;

const PREFERENCE_KEY = 'caravana.language';
const DICTIONARIES: Record<Exclude<Language, 'es'>, Record<string, string>> = { en };

type Device = {
  languageCode: string | null;
  regionCode: string | null;
  currencyCode: string | null;
  measurementSystem: 'metric' | 'us' | 'uk' | null;
  uses24hourClock: boolean | null;
};

function readDevice(): Device {
  try {
    const locale = getLocales()[0];
    return {
      languageCode: locale?.languageCode ?? null,
      regionCode: locale?.regionCode ?? null,
      currencyCode: locale?.currencyCode ?? null,
      measurementSystem: locale?.measurementSystem ?? null,
      uses24hourClock: null,
    };
  } catch {
    return { languageCode: null, regionCode: null, currencyCode: null, measurementSystem: null, uses24hourClock: null };
  }
}

function readPreference(): LanguagePreference {
  if (Platform.OS === 'web') return 'auto';
  try {
    const value = SecureStore.getItem(PREFERENCE_KEY);
    return value === 'es' || value === 'en' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

// R-07 / OTR-03 (D-02): la interfaz es en español. En automático solo pasa a
// inglés si el teléfono está en inglés; cualquier otro idioma usa el español.
export function resolveLanguage(preference: LanguagePreference, deviceLanguage: string | null): Language {
  if (preference !== 'auto') return preference;
  return deviceLanguage === 'en' ? 'en' : 'es';
}

const device = readDevice();
let preference = readPreference();
let language: Language = resolveLanguage(preference, device.languageCode);

export function getLanguage() {
  return language;
}

export function getLanguagePreference() {
  return preference;
}

// Guarda la elección. Devuelve true si cambia el idioma (hay que reiniciar).
export function saveLanguagePreference(next: LanguagePreference) {
  preference = next;
  try {
    if (Platform.OS !== 'web') SecureStore.setItem(PREFERENCE_KEY, next);
  } catch {
    // Sin almacenamiento seguro: vale para esta sesión.
  }
  const resolved = resolveLanguage(next, device.languageCode);
  const changed = resolved !== language;
  language = resolved;
  return changed;
}

// Solo para las pruebas.
export function setLanguageForTests(next: Language) {
  language = next;
}

// Traduce un texto en español. {0}, {1}… se rellenan con los argumentos.
export function t(text: string, ...args: (string | number | null | undefined)[]) {
  const translated = language === 'es' ? text : DICTIONARIES[language][text] ?? text;
  if (args.length === 0) return translated;
  return translated.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value == null ? '' : String(value);
  });
}

// ---------------------------------------------------------------------------
// Formatos del país
// ---------------------------------------------------------------------------

// Locale para Intl y toLocale*: el idioma de la app con la región del teléfono
// (en-US, en-GB, es-DO, es-ES…).
export function getLocale() {
  const region = device.regionCode ?? (language === 'es' ? 'DO' : 'US');
  return `${language}-${region}`;
}

// Millas en EE. UU. y Reino Unido (y los pocos países que las usan).
const MILE_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);
const MILES =
  device.measurementSystem === 'us' ||
  device.measurementSystem === 'uk' ||
  (device.regionCode != null && MILE_REGIONS.has(device.regionCode));
let miles = MILES;

// Las unidades siguen a la carretera, no al teléfono: muchos móviles en RD
// vienen con región de EE. UU. y marcaban mph con señales en km/h. Dentro de
// la República Dominicana siempre km/h.
export function setUnitsFromPosition(latitude: number, longitude: number) {
  const inDominicanRepublic = latitude > 17.3 && latitude < 20.1 && longitude > -72.1 && longitude < -68.2;
  miles = inDominicanRepublic ? false : MILES;
}

export function usesMiles() {
  return miles;
}

// Solo para las pruebas.
export function setMilesForTests(next: boolean) {
  miles = next;
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

export function formatDecimal(value: number, decimals = 0) {
  try {
    return new Intl.NumberFormat(getLocale(), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}

// Velocidad en la unidad del país (km/h o mph), redondeada.
export function displaySpeed(kmh: number) {
  return Math.round(miles ? (kmh * 1000) / METERS_PER_MILE : kmh);
}

export function speedUnit() {
  return miles ? 'mph' : 'km/h';
}

export function distanceUnit() {
  return miles ? 'mi' : 'km';
}

// Kilómetros (u odómetro) en la unidad del país, sin el sufijo.
export function displayKm(km: number, decimals = 0) {
  return formatDecimal(miles ? (km * 1000) / METERS_PER_MILE : km, decimals);
}

// Distancia corta legible: «350 m», «2,4 km» / «0.3 mi», «12 mi».
export function formatDistance(meters: number) {
  if (miles) {
    const mi = meters / METERS_PER_MILE;
    if (mi < 0.1) return `${Math.round((meters * FEET_PER_METER) / 10) * 10} ft`;
    return `${formatDecimal(mi, mi < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${formatDecimal(km, km < 10 ? 1 : 0)} km`;
}

// Distancia a la próxima maniobra, redondeada como la dicen los navegadores.
export function formatManeuverDistance(meters: number) {
  if (miles) {
    const feet = meters * FEET_PER_METER;
    if (feet < 1000) return `${Math.max(50, Math.round(feet / 50) * 50)} ft`;
    return `${formatDecimal(meters / METERS_PER_MILE, 1)} mi`;
  }
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(10, Math.round(meters / 10) * 10) : Math.round(meters / 50) * 50;
    return `${rounded} m`;
  }
  return `${formatDecimal(meters / 1000, 1)} km`;
}

// OTR-03 (D-03): monedas admitidas; DOP por defecto.
export const SUPPORTED_CURRENCIES = ['DOP', 'USD', 'EUR', 'MXN'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function resolveCurrency(deviceCurrency: string | null): Currency {
  const code = deviceCurrency?.toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code ?? '') ? (code as Currency) : 'DOP';
}

export function getCurrency(): Currency {
  return resolveCurrency(device.currencyCode);
}

// Idioma de la voz de navegación.
export function speechLanguage() {
  return language === 'es' ? 'es-ES' : 'en-US';
}

// Meses abreviados en el idioma de la app: «ene», «feb»… / «Jan», «Feb»…
export function shortMonths() {
  return Array.from({ length: 12 }, (_, month) => {
    try {
      // Día 15 a mediodía: con el día 1 a medianoche, una zona horaria del
      // formateador una hora por detrás daba el mes anterior («4 oct» el 4 de
      // noviembre en la tableta).
      return new Date(2000, month, 15, 12).toLocaleDateString(getLocale(), { month: 'short' }).replace('.', '');
    } catch {
      return String(month + 1);
    }
  });
}

// Distancias guardadas en km (odómetro, mantenimiento, rutas) en la unidad del
// país, y lo que escribe el usuario de vuelta a km.
export function kmToDisplay(km: number) {
  return miles ? (km * 1000) / METERS_PER_MILE : km;
}

export function displayToKm(value: number) {
  return miles ? (value * METERS_PER_MILE) / 1000 : value;
}

export function formatKmValue(km: number, decimals = 0) {
  return `${displayKm(km, decimals)} ${distanceUnit()}`;
}
