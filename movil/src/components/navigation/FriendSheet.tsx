import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, IconButton } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import type { WorldMapMember } from '@/src/lib/map-html';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

export function FriendSheet({
  friend,
  status = t('En el mapa'),
  inviteLabel = t('Invitar al convoy'),
  inviting = false,
  onInvite,
  onChallenge,
  onFollow,
  onProfile,
  onClose,
}: {
  friend: WorldMapMember;
  status?: string;
  inviteLabel?: string;
  inviting?: boolean;
  onInvite: () => void;
  onChallenge: () => void;
  // Solo si es del convoy (con posición en vivo).
  onFollow?: () => void;
  // Abre su perfil (tocando la foto o el nombre).
  onProfile?: () => void;
  onClose: () => void;
}) {
  const chrome = useMapChrome();
  return (
    <View style={[styles.friendSheet, chrome.surface]}>
      <View style={styles.friendRow}>
        <Pressable
          style={styles.friendLink}
          onPress={onProfile}
          disabled={!onProfile}
          accessibilityRole="button"
          accessibilityLabel={t('Ver perfil de {0}', friend.name)}
        >
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
              {onProfile ? `${status} · ${t('Ver perfil')}` : status}
            </AppText>
          </View>
        </Pressable>
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
          label={inviteLabel}
          variant="primary"
          size="sm"
          icon="person-add"
          loading={inviting}
          onPress={inviteLabel === t('En tu party') ? undefined : onInvite}
          style={styles.destinationAction}
        />
        {onFollow ? (
          <Button
            label={t('Seguir')}
            variant="secondary"
            size="sm"
            icon="navigate"
            onPress={onFollow}
            style={styles.destinationAction}
          />
        ) : null}
        <Button
          label={t('Retar')}
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
  friendLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  friendText: { flex: 1 },
});
