// Calle de una instrucción de Google Routes. Google escribe instrucciones con
// referencias y abreviaturas con punto:
//   «Gira a la izquierda en Cajero BanReservas hacia C. Mercedes\nPasa por …»
//   «En Jaragua Muebles, continúa por Av. San Martín»
//   «Toma el ramal de la izquierda en dirección Autop. Juan Pablo Duarte»
// La calle es lo que va detrás del último «hacia», «por», «dirección» o
// «incorporarte a» de la primera línea (la segunda es un «Pasa por …»).
// Sin dependencias: lo usa la Edge Function «routes» y lo prueban las pruebas.

const MARKERS = [
  'incorporarte a ',
  'continuar por ',
  'continúa por ',
  'en dirección ',
  'dirección ',
  'hacia ',
  ' por ',
  ' onto ',
  ' toward ',
  ' on ',
];

const PREFIXES = [/^el ramal a\s+/i, /^la salida a\s+/i, /^el\s+(norte|sur|este|oeste)\s*$/i];

export function streetFromInstruction(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text.split('\n')[0].trim();
  let best = -1;
  let bestEnd = -1;
  for (const marker of MARKERS) {
    const at = line.toLowerCase().lastIndexOf(marker);
    if (at >= 0 && at + marker.length > bestEnd) {
      best = at;
      bestEnd = at + marker.length;
    }
  }
  if (best < 0) return undefined;
  let street = line.slice(bestEnd).trim();
  for (const prefix of PREFIXES) street = street.replace(prefix, '');
  street = street.replace(/[.,;]+$/, '').trim();
  // «Dirígete hacia el este»: un punto cardinal no es una calle.
  if (!street || /^(el\s+)?(norte|sur|este|oeste|north|south|east|west)$/i.test(street)) return undefined;
  return street;
}
