import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Pill } from '@/src/components/ui';
import type { useVoiceRoom } from '@/src/hooks/useVoiceRoom';
import { partyVoiceChannels, type PartyVoiceChannelSlug } from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

type VoiceRoom = ReturnType<typeof useVoiceRoom>;

type Props = {
  isDemo: boolean;
  voice: Pick<
    VoiceRoom,
    'status' | 'participantCount' | 'error' | 'handsFree' | 'setHandsFree' | 'mutedAll' | 'setMuteAll'
  >;
  current: PartyVoiceChannelSlug;
  channelCount: (slug: PartyVoiceChannelSlug) => number;
  onSelect: (slug: PartyVoiceChannelSlug) => void;
};

// Canales de voz de la party y estado de la conexión PTT.
export function PartyVoicePanel({ isDemo, voice, current, channelCount, onSelect }: Props) {
  return (
    <View style={styles.voiceSection}>
      <View style={styles.voiceHeader}>
        <AppText variant="label" color={colors.muted}>{t('CANALES DE VOZ · 3')}</AppText>
        <Pill
          label={
            isDemo
              ? t('Demo')
              : voice.status === 'connected'
                ? t('Voz {0}', voice.participantCount)
                : voice.status === 'connecting'
                  ? t('Conectando')
                  : voice.status === 'error'
                    ? t('Sin voz')
                    : t('Inactivo')
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
                  {channelCount(channel.slug)}{' '}{t('EN CANAL')}
                </AppText>
              </View>
              {selected ? <View style={styles.channelDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {!isDemo && voice.status === 'connected' ? (
        <View style={styles.toggles}>
          {/* CONV-14: hablar sin tocar la pantalla (micrófono abierto). */}
          <Pressable
            style={[styles.toggle, voice.handsFree && styles.toggleOn]}
            onPress={() => void voice.setHandsFree(!voice.handsFree)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voice.handsFree }}
          >
            <Ionicons name={voice.handsFree ? 'mic' : 'mic-outline'} size={15} color={voice.handsFree ? colors.accent : colors.muted} />
            <AppText variant="caption" color={voice.handsFree ? colors.text : colors.textSoft}>
              {voice.handsFree ? t('Manos libres: micro abierto') : t('Manos libres')}
            </AppText>
          </Pressable>
          {/* CONV-15: silenciar el audio del convoy. */}
          <Pressable
            style={[styles.toggle, voice.mutedAll && styles.toggleOn]}
            onPress={() => voice.setMuteAll(!voice.mutedAll)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voice.mutedAll }}
          >
            <Ionicons name={voice.mutedAll ? 'volume-mute' : 'volume-high-outline'} size={15} color={voice.mutedAll ? colors.accent : colors.muted} />
            <AppText variant="caption" color={voice.mutedAll ? colors.text : colors.textSoft}>
              {voice.mutedAll ? t('Convoy silenciado') : t('Silenciar convoy')}
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {voice.error && !isDemo ? (
        <AppText variant="caption" color={colors.muted} numberOfLines={2}>
          {voice.error}
        </AppText>
      ) : (
        <AppText variant="caption" color={colors.dim} numberOfLines={1}>
          {isDemo
            ? t('Voz de ejemplo en modo demo.')
            : voice.status === 'connected'
              ? t('PTT real en {0}.', partyVoiceChannels.find((item) => item.slug === current)?.name ?? 'Convoy')
              : t('Conectando el PTT de voz de la party…')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggles: { flexDirection: 'row', gap: 7 },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleOn: { borderColor: colors.accent },
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
