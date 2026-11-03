import { create } from 'zustand';

// CONV-15: ¿está hablando alguien del convoy? La voz de navegación espera a
// que termine (en vez de pisarle). Lo actualiza useVoiceRoom.
export const useConvoyVoiceActivity = create<{ othersSpeaking: boolean }>(() => ({
  othersSpeaking: false,
}));
