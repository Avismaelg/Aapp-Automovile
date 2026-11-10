import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvoyVoiceActivity } from '@/src/lib/voice-activity';
import { Platform } from 'react-native';

import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import {
  AndroidAudioTypePresets,
  AudioSession,
  DisconnectReason,
  initializeLiveKit,
  Room,
  RoomEvent,
  Track,
} from '@/src/lib/livekit';
import { startDriving, stopDriving } from '@/modules/motion';
import { ensureMicrophone as ensureMicrophonePermission } from '@/src/lib/microphone';
import { supabase } from '@/src/lib/supabase';
import { t } from '@/src/i18n';

// Estados visibles (fase 5 del prompt de producción): conectando, conectado,
// reconectando, sin conexión (se reintenta solo) y error.
type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';
// Tras caerse la red, se vuelve a intentar a los 5 s.
const RETRY_MS = 5_000;

// Fila de aperturas y cierres de la sesión de audio (nunca se cruzan).
let audioChain: Promise<void> = Promise.resolve();

// Tokens de LiveKit ya pedidos: duran 15 min en el servidor (livekit-token)
// y se reutilizan 10. Pedirlo cada vez era ~1 s de lo que tardaba la voz.
const TOKEN_REUSE_MS = 10 * 60_000;
const tokenCache = new Map<string, { payload: VoiceTokenResponse; at: number }>();

// Android no da el micrófono sin pedirlo: antes nunca se pedía y el PTT no
// transmitía nada.
// En iOS lo pide LiveKit al publicar el micrófono.
async function ensureMicrophone() {
  if (Platform.OS !== 'android') return true;
  return ensureMicrophonePermission();
}

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
  // CONV-14: manos libres (micrófono abierto) y CONV-15: silenciar a todos.
  const [handsFree, setHandsFreeState] = useState(false);
  const [mutedAll, setMutedAll] = useState(false);
  const mutedAllRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [talking, setTalkingState] = useState(false);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  // Sin permiso de micrófono se oye, pero no se puede hablar.
  const [micDenied, setMicDenied] = useState(false);

  // Sesión de audio: una vez por convoy, no por canal. Antes se cerraba y se
  // abría al cambiar de canal; si el cierre llegaba después de la apertura,
  // el audio quedaba en «modo normal» y lo recibido no sonaba (tableta en
  // Convoy oyendo silencio). Aperturas y cierres van en fila (audioChain) y
  // la sala espera a que la sesión esté lista. Salida por el altavoz.
  useEffect(() => {
    if (!enabled || !partyId || !AudioSession) return;
    const session = AudioSession;
    audioChain = audioChain.then(async () => {
      try {
        await session.configureAudio({
          android: {
            preferredOutputList: ['bluetooth', 'headset', 'speaker'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: 'speaker' },
        });
      } catch {
        // Sin configuración vale la de por defecto.
      }
      await session.startAudioSession().catch(() => {});
    });
    return () => {
      audioChain = audioChain.then(() => session.stopAudioSession().catch(() => {}));
    };
  }, [enabled, partyId]);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !partyId || !client) return;

    let active = true;
    let room: Room | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      setStatus('connecting');
      setError(null);
      setActiveSpeakerIds([]);
      setParticipantCount(0);

      try {
        initializeLiveKit();
        // La sesión de audio (efecto de arriba) y el token van a la vez.
        const cacheKey = `${partyId}:${channelSlug}`;
        const cached = tokenCache.get(cacheKey);
        const fresh = cached && Date.now() - cached.at < TOKEN_REUSE_MS;
        const [, response] = await Promise.all([
          audioChain,
          fresh
            ? Promise.resolve({ data: cached.payload, error: null })
            : client.functions.invoke('livekit-token', { body: { partyId, channelSlug } }),
        ]);
        const { data, error: functionError } = response;

        if (functionError) {
          let message = functionError.message;
          const context = (functionError as { context?: Response }).context;
          if (context) {
            try {
              const payload = (await context.clone().json()) as { error?: string };
              if (payload.error) message = payload.error;
            } catch {
              // Usamos el mensaje original si el cuerpo no es JSON.
            }
          }
          throw new Error(message);
        }

        const payload = (data ?? {}) as VoiceTokenResponse;
        if (payload.error) throw new Error(payload.error);
        if (!payload.token || !payload.url) {
          throw new Error(
            t('LiveKit no está configurado. Despliega la función livekit-token y sus secretos.'),
          );
        }
        // El token vale 2 h: se reutiliza al reconectar o volver a este canal.
        tokenCache.set(cacheKey, { payload, at: cached && fresh ? cached.at : Date.now() });

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
            const localId = room?.localParticipant.identity;
            useConvoyVoiceActivity.setState({
              othersSpeaking: speakers.some((speaker) => speaker.identity !== localId),
            });
          })
          .on(RoomEvent.TrackPublished, (publication) => {
            // Con «silenciar a todos», quien entra tampoco se oye.
            if (mutedAllRef.current && publication.kind === Track.Kind.Audio) publication.setSubscribed(false);
          })
          .on(RoomEvent.Reconnecting, () => {
            if (active) setStatus('reconnecting');
          })
          .on(RoomEvent.Reconnected, () => {
            if (active) setStatus('connected');
          })
          .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            if (!active) return;
            setTalkingState(false);
            setParticipantCount(0);
            setActiveSpeakerIds([]);
            roomRef.current = null;
            // Te sacó el servidor (saliste o te expulsaron del convoy): no se
            // reintenta. Si fue la red, se vuelve a intentar solo.
            if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.ROOM_DELETED) {
              tokenCache.clear();
              setStatus('idle');
              return;
            }
            if (reason === DisconnectReason.CLIENT_INITIATED) {
              setStatus('idle');
              return;
            }
            setStatus('offline');
            retryTimer = setTimeout(() => {
              if (active) void connect();
            }, RETRY_MS);
          });

        // Con 15 s por intento (lo normal) una red lenta dejaba la voz más de
        // 30 s conectando antes de probar otra región; con 6 s cambia antes.
        await room.connect(payload.url, payload.token, {
          autoSubscribe: true,
          websocketTimeout: 6_000,
          peerConnectionTimeout: 10_000,
        });
        if (!active) {
          room.disconnect();
          return;
        }

        // El micrófono permanece cerrado hasta que se pulse PTT.
        await room.localParticipant.setMicrophoneEnabled(false);
        updateParticipants();
        setStatus('connected');
        // CONV-15: la voz sigue con la pantalla bloqueada (servicio en primer
        // plano de tipo micrófono, con su notificación).
        startDriving('voice');
        // Se pide ya, para que el primer PTT no se pierda en el aviso.
        void ensureMicrophone().then((granted) => {
          if (active) setMicDenied(!granted);
        });
      } catch (connectError) {
        // Un token rechazado o caducado no se vuelve a usar.
        tokenCache.clear();
        if (!active) return;
        const message =
          connectError instanceof Error
            ? connectError.message
            : t('No pudimos conectar la voz.');
        // El usuario no necesita saber de LiveKit ni de secretos del servidor.
        // 401 / NotAllowed: el servidor de voz rechaza la clave de LiveKit
        // (API key o secret mal copiados en los secretos de Supabase).
        const notConfigured = /livekit|secret|not found|configurad|notallowed|401|unauthorized|invalid token/i.test(message);
        setError(
          notConfigured
            ? t('La voz del convoy aún no está activada. El mapa y el chat funcionan igual.')
            : /failed to fetch|network|timeout/i.test(message)
              ? t('No pudimos conectar la voz. Revisa tu conexión.')
              : t('No pudimos conectar la voz ahora. Inténtalo en un momento.'),
        );
        setStatus('error');
        setTalkingState(false);
        room?.disconnect();
        roomRef.current = null;
      }
    };

    void connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      setTalkingState(false);
      if (room) {
        room.disconnect();
      }
      roomRef.current = null;
      stopDriving('voice');
    };
  }, [channelSlug, enabled, partyId]);



  const setTalking = useCallback(async (next: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    if (next && !(await ensureMicrophone())) {
      setError(t('Sin permiso de micrófono no puedes hablar. Actívalo en Ajustes › Apps › Caravana.'));
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setTalkingState(next);
    } catch (micError) {
      setTalkingState(false);
      setError(
        micError instanceof Error
          ? micError.message
          : t('No pudimos activar el micrófono.'),
      );
    }
  }, []);

  const setHandsFree = useCallback(
    async (next: boolean) => {
      setHandsFreeState(next);
      await setTalking(next);
    },
    [setTalking],
  );

  const setMuteAll = useCallback((next: boolean) => {
    mutedAllRef.current = next;
    setMutedAll(next);
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication) => publication.setSubscribed(!next));
    });
  }, []);

  return {
    handsFree: enabled && partyId ? handsFree : false,
    setHandsFree,
    mutedAll,
    setMuteAll,
    status: enabled && partyId ? status : 'idle',
    micDenied: enabled && partyId ? micDenied : false,
    error: enabled && partyId ? error : null,
    talking: enabled && partyId ? talking : false,
    activeSpeakerIds: enabled && partyId ? activeSpeakerIds : [],
    participantCount: enabled && partyId ? participantCount : 0,
    setTalking,
  };
}
