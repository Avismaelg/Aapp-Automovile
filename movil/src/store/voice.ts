import { create } from 'zustand';

import type { PartyVoiceChannelSlug } from '@/src/lib/party';

// Voz del convoy compartida por toda la app (CONV-13…15). La conexión vive en
// VoiceHost (montado en la raíz mientras hay convoy), no en una pantalla: así
// el mapa y la pestaña Party usan la misma sala, se oye con el mapa abierto y
// al ir a hablar ya está conectada (antes tardaba ~5 s al abrir Party).

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';

type VoiceActions = {
  setTalking: (next: boolean) => Promise<void>;
  setHandsFree: (next: boolean) => Promise<void>;
  setMuteAll: (next: boolean) => void;
};

type VoiceState = VoiceActions & {
  channel: PartyVoiceChannelSlug;
  status: VoiceStatus;
  error: string | null;
  talking: boolean;
  activeSpeakerIds: string[];
  participantCount: number;
  handsFree: boolean;
  mutedAll: boolean;
  // Sin permiso de micrófono: se oye pero no se puede hablar.
  micDenied: boolean;
  setChannel: (channel: PartyVoiceChannelSlug) => void;
};

const noop = async () => {};

export const useConvoyVoice = create<VoiceState>((set) => ({
  // Todos empiezan en «Convoy»: cambiar de canal es una elección de la sesión.
  channel: 'convoy',
  status: 'idle',
  error: null,
  talking: false,
  activeSpeakerIds: [],
  participantCount: 0,
  handsFree: false,
  mutedAll: false,
  micDenied: false,
  setChannel: (channel) => set({ channel }),
  // VoiceHost las sustituye por las de la sala conectada.
  setTalking: noop,
  setHandsFree: noop,
  setMuteAll: () => {},
}));
