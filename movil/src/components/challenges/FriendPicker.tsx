import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button } from '@/src/components/ui';
import type { ChallengeFriend } from '@/src/lib/challenge-db';
import type { ChallengeCategory } from '@/src/types/models';
import { vehicleCategoryLabel, vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

type Props = {
  loading: boolean;
  friends: ChallengeFriend[];
  category: ChallengeCategory;
  showFindFriends: boolean;
  isSelected: (friend: ChallengeFriend) => boolean;
  onPress: (friend: ChallengeFriend) => void;
  onFindFriends: () => void;
};

export function FriendPicker({
  loading,
  friends,
  category,
  showFindFriends,
  isSelected,
  onPress,
  onFindFriends,
}: Props) {
  return loading ? (
    <View style={styles.noRivals}>
      <ActivityIndicator size="small" color={colors.accent} />
      <AppText variant="caption" color={colors.muted}>
        Cargando tus amigos y vehículos…
      </AppText>
    </View>
  ) : friends.length === 0 ? (
    <View style={styles.noRivals}>
      <Ionicons name="people-outline" size={22} color={colors.dim} />
      <AppText variant="caption" color={colors.muted}>
        No tienes amigos con {vehicleCategoryLabel(category).toLowerCase()}. Invita a uno o cambia de categoría.
      </AppText>
      {showFindFriends ? (
        <Button
          label="Buscar amigos"
          size="sm"
          variant="secondary"
          icon="person-add-outline"
          onPress={onFindFriends}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </View>
  ) : (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.friendRow}
    >
      {friends.map((friend) => {
        const kind = vehicleKindMeta[friend.vehicleKind];
        const selected = isSelected(friend);
        return (
          <Pressable
            key={friend.id}
            onPress={() => onPress(friend)}
            style={[styles.friendCard, selected && styles.friendCardActive]}
          >
            <Avatar name={friend.name} color={friend.color} size={44} online={friend.online} />
            <AppText variant="caption" color={colors.textSoft} numberOfLines={1} style={{ marginTop: 6 }}>
              {friend.name.split(' ')[0]}
            </AppText>
            <View style={styles.friendKind}>
              <Ionicons name={kind.icon} size={10} color={kind.color} />
              <AppText variant="label" color={kind.color} style={{ fontSize: 7 }}>
                {kind.shortLabel.toUpperCase()}
              </AppText>
            </View>
            {selected ? (
              <View style={styles.friendCheck}>
                <Ionicons name="checkmark" size={10} color="#120802" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  noRivals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  friendRow: { gap: 8, paddingRight: spacing.lg },
  friendCard: {
    width: 80,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 8,
  },
  friendCardActive: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  friendKind: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  friendCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
