import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/src/components/ui';
import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';

export type DisplayMember = {
  id: string;
  name: string;
  username: string;
  color: string;
  battery?: number;
  isTalking: boolean;
  isMe?: boolean;
  lastSeenAt?: string | null;
  voiceChannelSlug?: PartyVoiceChannelSlug;
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.memberRow}
    >
      {members.map((member) => (
        <Pressable
          key={member.id}
          onPress={() => onChallenge(member)}
          disabled={member.isMe}
          style={({ pressed }) => [styles.member, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={`Retar a ${member.name}`}
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
              {member.isMe ? 'Tú' : member.name.split(' ')[0]}
            </AppText>
            <AppText variant="label" color={member.isTalking ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
              {member.isTalking
                ? 'HABLANDO'
                : member.battery != null
                  ? `${member.battery}%`
                  : 'EN VIVO'}
            </AppText>
          </View>
        </Pressable>
      ))}
      <Pressable style={styles.addMember} onPress={onInvite}>
        <Ionicons name="add" size={20} color={colors.muted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  memberRow: { gap: 8, paddingVertical: spacing.md, paddingRight: spacing.lg },
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
