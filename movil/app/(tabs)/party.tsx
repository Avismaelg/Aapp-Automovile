import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveMap } from '@/src/components/LiveMap';
import { PTTButton } from '@/src/components/PTTButton';
import { AppText, Avatar, IconButton, Pill } from '@/src/components/ui';
import { activeParty, partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { formatClock } from '@/src/lib/format';
import { partyUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';

export default function PartyScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const [talking, setTalking] = useState(false);
  const [elapsed, setElapsed] = useState(activeParty.elapsedSeconds);

  const startTalking = () => {
    setTalking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopTalking = () => {
    setTalking(false);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <View style={styles.container}>
      <LiveMap members={partyMembers} height={900} compact />

      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <IconButton icon="chevron-down" size={40} onPress={() => router.replace('/(tabs)')} />
          <Pill label="Party en vivo" tone="danger" icon="radio" />
          <IconButton
            icon="ellipsis-horizontal"
            size={40}
            onPress={() =>
              Share.share({
                message: `Únete a mi party en Caravana: ${partyUrl(activeParty.code)}`,
                url: partyUrl(activeParty.code),
              })
            }
          />
        </View>

        <View style={styles.titleBlock}>
          <AppText variant="h2">{activeParty.name}</AppText>
          <View style={styles.destinationRow}>
            <Ionicons name="location" size={13} color={colors.accent} />
            <AppText variant="caption" color={colors.textSoft}>
              {activeParty.destination} · ETA {activeParty.etaMin} min
            </AppText>
          </View>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.muted}>
              Caravana en curso
            </AppText>
            <View style={styles.metaRow}>
              <AppText variant="mono" color={colors.text} style={{ fontSize: 17 }}>
                {formatClock(elapsed)}
              </AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                {activeParty.distanceKm} km
              </AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                4 coches
              </AppText>
            </View>
          </View>
          <Pressable
            style={styles.inviteButton}
            onPress={() =>
              Share.share({
                message: `Únete a mi party en Caravana: ${partyUrl(activeParty.code)}`,
                url: partyUrl(activeParty.code),
              })
            }
          >
            <Ionicons name="person-add" size={15} color={colors.accent} />
            <AppText variant="label" color={colors.accent}>Invitar</AppText>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.memberRow}
        >
          {partyMembers.map((member) => (
            <View key={member.id} style={styles.member}>
              <Avatar
                name={member.name}
                color={member.color}
                size={38}
                online
                ring={member.isTalking ? colors.accent : colors.border}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                  {member.username === currentUser.username
                    ? 'Tú'
                    : member.name.split(' ')[0]}
                </AppText>
                <AppText variant="label" color={member.isTalking ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
                  {member.isTalking ? 'HABLANDO' : `${member.battery}%`}
                </AppText>
              </View>
            </View>
          ))}
          <Pressable style={styles.addMember} onPress={() => setElapsed((v) => v + 1)}>
            <Ionicons name="add" size={20} color={colors.muted} />
          </Pressable>
        </ScrollView>

        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: colors.lime }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Salida</AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>Av. Winston Churchill</AppText>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={14} color={colors.dim} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: colors.accent }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Destino</AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>Constanza</AppText>
            </View>
          </View>
        </View>

        <PTTButton
          talking={talking}
          onPressIn={startTalking}
          onPressOut={stopTalking}
        />

        <View style={styles.bottomActions}>
          <Pressable style={styles.bottomAction}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>Chat</AppText>
            <View style={styles.unread} />
          </Pressable>
          <Pressable
            style={styles.bottomAction}
            onPress={() =>
              Share.share({
                message: `Únete a mi party en Caravana: ${partyUrl(activeParty.code)}`,
                url: partyUrl(activeParty.code),
              })
            }
          >
            <Ionicons name="share-social-outline" size={20} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>Compartir</AppText>
          </Pressable>
          <Pressable style={styles.bottomAction} onPress={() => router.push('/(tabs)/challenges')}>
            <Ionicons name="flag-outline" size={19} color={colors.lime} />
            <AppText variant="caption" color={colors.lime}>Retar</AppText>
          </Pressable>
          <Pressable style={styles.leaveAction} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="exit-outline" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger}>Salir</AppText>
          </Pressable>
        </View>
      </View>

      <LinearGradient
        colors={['rgba(6,8,11,0.7)', 'transparent']}
        style={styles.topFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: { marginTop: spacing.lg },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
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
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  routePoint: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  bottomAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unread: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginLeft: -3,
  },
  leaveAction: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
});
