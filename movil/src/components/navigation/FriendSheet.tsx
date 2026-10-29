import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, IconButton } from '@/src/components/ui';
import type { WorldMapMember } from '@/src/lib/map-html';
import { colors, radius, spacing } from '@/src/theme';

export function FriendSheet({
  friend,
  onInvite,
  onChallenge,
  onClose,
}: {
  friend: WorldMapMember;
  onInvite: () => void;
  onChallenge: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.friendSheet}>
      <View style={styles.friendRow}>
        <Avatar
          name={friend.name}
          color={friend.color}
          size={38}
          online
          ring={colors.border}
        />
        <View style={styles.friendText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {friend.name}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            En el mapa ahora
          </AppText>
        </View>
        <IconButton
          icon="close"
          size={30}
          tone="ghost"
          onPress={onClose}
        />
      </View>
      <View style={styles.destinationActions}>
        <Button
          label="Invitar al convoy"
          variant="lime"
          size="sm"
          icon="person-add"
          onPress={onInvite}
          style={styles.destinationAction}
        />
        <Button
          label="Retar"
          variant="secondary"
          size="sm"
          icon="flag"
          onPress={onChallenge}
          style={styles.destinationAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  destinationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  destinationAction: { flexShrink: 1 },
  friendSheet: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(11,15,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.3)',
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  friendText: { flex: 1 },
});
