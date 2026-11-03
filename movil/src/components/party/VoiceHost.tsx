import { useEffect } from 'react';

import { useActiveParty } from '@/src/hooks/useParty';
import { useVoiceRoom } from '@/src/hooks/useVoiceRoom';
import { useConvoyVoice } from '@/src/store/voice';

// Mantiene la sala de voz del convoy conectada mientras estás en un convoy,
// estés en el mapa, en Party o en otra pantalla. Publica su estado en
// useConvoyVoice para que cualquier pantalla tenga el botón de hablar.
export function VoiceHost() {
  const { party, isDemo } = useActiveParty();
  const channel = useConvoyVoice((state) => state.channel);
  const voice = useVoiceRoom({
    partyId: party?.id,
    channelSlug: channel,
    enabled: Boolean(party) && !isDemo,
  });

  const { status, error, talking, activeSpeakerIds, participantCount, handsFree, mutedAll } = voice;
  const { setTalking, setHandsFree, setMuteAll } = voice;
  useEffect(() => {
    useConvoyVoice.setState({
      status,
      error,
      talking,
      activeSpeakerIds,
      participantCount,
      handsFree,
      mutedAll,
      setTalking,
      setHandsFree,
      setMuteAll,
    });
  }, [status, error, talking, activeSpeakerIds, participantCount, handsFree, mutedAll, setTalking, setHandsFree, setMuteAll]);

  // Al salir del convoy se vuelve a «Convoy» para la próxima vez.
  const partyId = party?.id ?? null;
  useEffect(() => {
    if (!partyId) useConvoyVoice.setState({ channel: 'convoy' });
  }, [partyId]);

  return null;
}
