import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/src/components/ui';
import { convoyMemberLabel } from '@/src/lib/convoy';
import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';
import { formatDistance, t } from '@/src/i18n';

export type DisplayMember = {
  id: string;
  name: string;
  username: string;
  color: string;
  battery?: number;
  isTalking: boolean;
  isMe?: boolean;
  lastSeenAt?: string | null;
  speedKmh?: number | null;
  voiceChannelSlug?: PartyVoiceChannelSlug;
  role?: 'host' | 'member' | 'sweeper';
  // CONV-05: ETA y distancia a la meta común.
  etaS?: number | null;
  remainingM?: number | null;
  progressAt?: string | null;
  arrivedAt?: string | null;
};

export function PartyMembersRow({
  members,
  onChallenge,
  onInvite,
}: {
  members: DisplayMember[];
  onChallenge: (member: DisplayMember) => void;
  onInvite: () => void;
}) {
  // Reloj para que «HACE 2 MIN» avance aunque no llegue nada nuevo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // Lista virtualizada: en parties grandes solo se pintan los visibles.
  return (
    <FlatList
      horizontal
      data={members}
      extraData={now}
      keyExtractor={(member) => member.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.memberRow}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
      ItemSeparatorComponent={Separator}
      renderItem={({ item: member }) => (
        <Pressable
          onPress={() => onChallenge(member)}
          disabled={member.isMe}
          style={({ pressed }) => [styles.member, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={t('Seguir o retar a {0}', member.name)}
        >
          <Avatar
            name={member.name}
            color={member.color}
            size={38}
            online
            ring={member.isTalking ? colors.accent : colors.border}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
              {member.isMe ? t('Tú') : member.name.split(' ')[0]}
            </AppText>
            <AppText variant="label" color={member.isTalking ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
              {member.isTalking
                ? 'HABLANDO'
                : member.battery != null
                  ? `${member.battery}%`
                  : member.lastSeenAt !== undefined
                    ? convoyMemberLabel(
                        {
                          lastSeenAt: member.lastSeenAt ?? null,
                          speedKmh: member.speedKmh ?? null,
                          isMe: member.isMe && !member.arrivedAt && member.etaS == null,
                          etaS: member.etaS ?? null,
                          remainingM: member.remainingM ?? null,
                          progressAt: member.progressAt ?? null,
                          arrivedAt: member.arrivedAt ?? null,
                        },
                        now,
                        formatDistance,
                      )
                    : t('EN VIVO')}
            </AppText>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <Pressable
          style={styles.addMember}
          onPress={onInvite}
          accessibilityRole="button"
          accessibilityLabel={t('Invitar')}
        >
          <Ionicons name="add" size={20} color={colors.muted} />
        </Pressable>
      }
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  memberRow: { paddingVertical: spacing.md, paddingRight: spacing.lg },
  separator: { width: 8 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minWidth: 118,
  },
  addMember: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
