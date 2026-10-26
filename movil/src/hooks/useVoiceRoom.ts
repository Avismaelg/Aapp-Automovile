import { useCallback, useEffect, useRef, useState } from 'react';

import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import {
  AudioSession,
  initializeLiveKit,
  Room,
  RoomEvent,
} from '@/src/lib/livekit';
import { supabase } from '@/src/lib/supabase';

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

type VoiceTokenResponse = {
  token?: string;
  url?: string;
  roomName?: string;
  error?: string;
};

export function useVoiceRoom({
  partyId,
  channelSlug,
  enabled,
}: {
  partyId?: string;
  channelSlug: PartyVoiceChannelSlug;
  enabled: boolean;
}) {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [talking, setTalkingState] = useState(false);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !partyId || !client) return;

    let active = true;
    let room: Room | null = null;

    const connect = async () => {
      setStatus('connecting');
      setError(null);
      setActiveSpeakerIds([]);
      setParticipantCount(0);

      try {
        initializeLiveKit();
        if (AudioSession) {
          await AudioSession.startAudioSession();
        }

        const { data, error: functionError } = await client.functions.invoke(
          'livekit-token',
          { body: { partyId, channelSlug } },
        );

        if (functionError) {
          throw new Error(functionError.message);
        }

        const payload = (data ?? {}) as VoiceTokenResponse;
        if (payload.error) throw new Error(payload.error);
        if (!payload.token || !payload.url) {
          throw new Error(
            'LiveKit no está configurado. Despliega la función livekit-token y sus secretos.',
          );
        }

        if (!active) return;

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        roomRef.current = room;

        const updateParticipants = () => {
          if (!room || !active) return;
          setParticipantCount(room.remoteParticipants.size + 1);
        };

        room
          .on(RoomEvent.ParticipantConnected, updateParticipants)
          .on(RoomEvent.ParticipantDisconnected, updateParticipants)
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (!active) return;
            setActiveSpeakerIds(speakers.map((speaker) => speaker.identity));
          })
          .on(RoomEvent.Disconnected, () => {
            if (!active) return;
            setTalkingState(false);
            setStatus('idle');
            setParticipantCount(0);
            setActiveSpeakerIds([]);
          });

        await room.connect(payload.url, payload.token, { autoSubscribe: true });
        if (!active) {
          room.disconnect();
          return;
        }

        // El micrófono permanece cerrado hasta que se pulse PTT.
        await room.localParticipant.setMicrophoneEnabled(false);
        updateParticipants();
        setStatus('connected');
      } catch (connectError) {
        if (!active) return;
        const message =
          connectError instanceof Error
            ? connectError.message
            : 'No pudimos conectar la voz.';
        setError(
          message.includes('Failed to fetch') || message.includes('not found')
            ? 'LiveKit no está configurado. Despliega la función livekit-token y sus secretos.'
            : message,
        );
        setStatus('error');
        setTalkingState(false);
        room?.disconnect();
        roomRef.current = null;
        if (AudioSession) {
          await AudioSession.stopAudioSession().catch(() => {});
        }
      }
    };

    void connect();

    return () => {
      active = false;
      setTalkingState(false);
      if (room) {
        room.disconnect();
      }
      roomRef.current = null;
      if (AudioSession) {
        void AudioSession.stopAudioSession().catch(() => {});
      }
    };
  }, [channelSlug, enabled, partyId]);

  const setTalking = useCallback(async (next: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setTalkingState(next);
    } catch (micError) {
      setTalkingState(false);
      setError(
        micError instanceof Error
          ? micError.message
          : 'No pudimos activar el micrófono.',
      );
    }
  }, []);

  return {
    status: enabled && partyId ? status : 'idle',
    error: enabled && partyId ? error : null,
    talking: enabled && partyId ? talking : false,
    activeSpeakerIds: enabled && partyId ? activeSpeakerIds : [],
    participantCount: enabled && partyId ? participantCount : 0,
    setTalking,
  };
}
