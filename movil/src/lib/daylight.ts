// Salida y puesta de sol aproximadas (ecuación del amanecer, precisión de un
// par de minutos), suficiente para cambiar el mapa entre día y noche.
export type MapTheme = 'day' | 'night';

const DAY_MS = 86_400_000;
const J2000 = 2451545;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function julianDay(ms: number) {
  return ms / DAY_MS + 2440587.5;
}

function fromJulian(jd: number) {
  return (jd - 2440587.5) * DAY_MS;
}

// Sol del día solar n: tránsito (mediodía solar) y semiarco en días.
function solarDay(n: number, latitude: number, longitude: number) {
  const meanSolarTime = n - longitude / 360;
  const anomaly = (357.5291 + 0.98560028 * meanSolarTime) % 360;
  const m = toRad(anomaly);
  const center = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const eclipticLongitude = toRad((anomaly + center + 180 + 102.9372) % 360);
  const transit =
    J2000 + meanSolarTime + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * eclipticLongitude);
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(toRad(23.4397)));
  const phi = toRad(latitude);
  const cosHourAngle =
    (Math.sin(toRad(-0.833)) - Math.sin(phi) * Math.sin(declination)) /
    (Math.cos(phi) * Math.cos(declination));
  return { transit, cosHourAngle };
}

export function sunTimes(at: number, latitude: number, longitude: number) {
  const jd = julianDay(at);
  let n = Math.round(jd - J2000 + longitude / 360);
  let day = solarDay(n, latitude, longitude);
  // Elegimos el día solar cuyo mediodía queda más cerca de ahora.
  if (day.transit - jd > 0.5) day = solarDay((n -= 1), latitude, longitude);
  else if (jd - day.transit > 0.5) day = solarDay((n += 1), latitude, longitude);

  if (day.cosHourAngle > 1) return { sunrise: null, sunset: null, polar: 'night' as const };
  if (day.cosHourAngle < -1) return { sunrise: null, sunset: null, polar: 'day' as const };
  const halfArc = toDeg(Math.acos(day.cosHourAngle)) / 360;
  return {
    sunrise: fromJulian(day.transit - halfArc),
    sunset: fromJulian(day.transit + halfArc),
    polar: null,
  };
}

export function mapThemeAt(at: number, latitude: number, longitude: number): MapTheme {
  const times = sunTimes(at, latitude, longitude);
  if (times.polar) return times.polar;
  return at >= times.sunrise && at < times.sunset ? 'day' : 'night';
}
