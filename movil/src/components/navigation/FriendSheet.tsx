import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, IconButton } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
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
  const chrome = useMapChrome();
  return (
    <View style={[styles.friendSheet, chrome.surface]}>
      <View style={styles.friendRow}>
        <Avatar
          name={friend.name}
          color={friend.color}
          size={38}
          online
          ring={colors.border}
        />
        <View style={styles.friendText}>
          <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
            {friend.name}
          </AppText>
          <AppText variant="caption" color={chrome.muted}>
            En el mapa ahora
          </AppText>
        </View>
        <IconButton
          icon="close"
          size={30}
          tone="ghost"
          color={chrome.muted}
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
