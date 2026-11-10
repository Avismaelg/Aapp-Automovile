import { t } from '@/src/i18n';

// Reglas del chat del convoy (sin React): mensajes rápidos, bloqueo de texto
// en marcha y no leídos.

// CONV-12: por encima de esto no se escribe (solo mensajes rápidos y voz),
// salvo que confirmes que vas de pasajero.
export const TYPING_MAX_KMH = 10;

export function typingBlocked(speedKmh: number | null, passenger: boolean) {
  return !passenger && speedKmh != null && speedKmh > TYPING_MAX_KMH;
}

// Mensajes de un toque. «Llego en X» usa tu ETA real si vas hacia la meta.
export function quickMessages(etaMinutes: number | null) {
  return [
    t('Voy en camino'),
    etaMinutes != null ? t('Llego en {0} min', etaMinutes) : t('Llego en 5 min'),
    t('Paro a echar gasolina'),
    t('Espérenme'),
    t('Todo bien por aquí 👍'),
  ];
}

// CONV-10: no leídos = mensajes de otros con id mayor que el último leído.
export function unreadCount(
  messages: { id: number; isMe: boolean }[],
  lastReadId: number | undefined,
) {
  return messages.filter((message) => !message.isMe && message.id > (lastReadId ?? 0)).length;
}
