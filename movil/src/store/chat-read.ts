import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// CONV-10: último mensaje leído del chat de cada party (para los no leídos).
type ReadState = {
  lastRead: Record<string, number>;
  markRead: (partyId: string, messageId: number) => void;
};

export const useChatRead = create<ReadState>()(
  persist(
    (set) => ({
      lastRead: {},
      markRead: (partyId, messageId) =>
        set((state) =>
          (state.lastRead[partyId] ?? 0) >= messageId
            ? state
            : { lastRead: { ...state.lastRead, [partyId]: messageId } },
        ),
    }),
    { name: 'caravana.chat-read.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
