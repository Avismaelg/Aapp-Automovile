import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Pill } from '@/src/components/ui';
import type { useVoiceRoom } from '@/src/hooks/useVoiceRoom';
import { partyVoiceChannels, type PartyVoiceChannelSlug } from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';

type VoiceRoom = ReturnType<typeof useVoiceRoom>;

type Props = {
  isDemo: boolean;
  voice: Pick<VoiceRoom, 'status' | 'participantCount' | 'error'>;
  current: PartyVoiceChannelSlug;
  channelCount: (slug: PartyVoiceChannelSlug) => number;
  onSelect: (slug: PartyVoiceChannelSlug) => void;
};

// Canales de voz de la party y estado de la conexión PTT.
export function PartyVoicePanel({ isDemo, voice, current, channelCount, onSelect }: Props) {
  return (
    <View style={styles.voiceSection}>
      <View style={styles.voiceHeader}>
        <AppText variant="label" color={colors.muted}>CANALES DE VOZ · 3</AppText>
        <Pill
          label={
            isDemo
              ? 'Demo'
              : voice.status === 'connected'
                ? `Voz ${voice.participantCount}`
                : voice.status === 'connecting'
                  ? 'Conectando'
                  : voice.status === 'error'
                    ? 'Sin configurar'
                    : 'Inactivo'
          }
          tone={
            voice.status === 'connected'
              ? 'lime'
              : voice.status === 'error'
                ? 'danger'
                : 'neutral'
          }
          icon="mic-outline"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.channelRow}
      >
        {partyVoiceChannels.map((channel) => {
          const selected = channel.slug === current;
          return (
            <Pressable
              key={channel.slug}
              onPress={() => onSelect(channel.slug)}
              style={[styles.channelChip, selected && styles.channelChipActive]}
            >
              <Ionicons
                name={
                  channel.slug === 'convoy'
                    ? 'radio-outline'
                    : channel.slug === 'route'
                      ? 'navigate-outline'
                      : 'chatbubbles-outline'
                }
                size={15}
                color={selected ? colors.accent : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={selected ? colors.text : colors.textSoft}>
                  {channel.name}
                </AppText>
                <AppText variant="label" color={selected ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
                  {channelCount(channel.slug)} EN CANAL
                </AppText>
              </View>
              {selected ? <View style={styles.channelDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {voice.error && !isDemo ? (
        <AppText variant="caption" color={colors.accent} numberOfLines={2}>
          {voice.error}
        </AppText>
      ) : (
        <AppText variant="caption" color={colors.dim} numberOfLines={1}>
          {isDemo
            ? 'Voz de ejemplo en modo demo.'
            : voice.status === 'connected'
              ? `PTT real en ${partyVoiceChannels.find((item) => item.slug === current)?.name ?? 'Convoy'}.`
              : 'Conectando el PTT de voz de la party…'}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  voiceSection: {
    marginTop: spacing.sm,
    gap: 7,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelRow: {
    gap: 7,
    paddingRight: spacing.lg,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 116,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  channelChipActive: {
    borderColor: 'rgba(255,90,31,0.42)',
    backgroundColor: colors.accentSoft,
  },
  channelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lime,
  },
});
