import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar } from '@/src/components/ui';
import {
  useAcceptPartyInvite,
  useDeclinePartyInvite,
  useIncomingPartyInvites,
  type IncomingPartyInvite,
} from '@/src/hooks/usePartyInvites';
import { errorMessage } from '@/src/lib/alerts';
import { profileColor } from '@/src/lib/profile-db';
import { answerSimInvite, useSimulator } from '@/src/lib/simulator';
import { colors, radius, spacing } from '@/src/theme';

// Aviso en cualquier pantalla cuando un amigo te invita: «Unirme» te mete en
// su party y abre la pestaña Party.
export function PartyInviteBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { invites: realInvites } = useIncomingPartyInvites();
  const simInvite = useSimulator((state) => state.invite);
  // La invitación del simulador se muestra igual que una real.
  const invites = useMemo<IncomingPartyInvite[]>(
    () =>
      simInvite
        ? [
            {
              id: simInvite.id,
              partyId: 'sim',
              partyName: simInvite.partyName,
              destinationLabel: null,
              inviter: null,
              inviterName: simInvite.inviterName,
              createdAt: new Date().toISOString(),
            },
            ...realInvites,
          ]
        : realInvites,
    [realInvites, simInvite],
  );
  const accept = useAcceptPartyInvite();
  const decline = useDeclinePartyInvite();
  const [error, setError] = useState<string | null>(null);
  const invite = invites[0];
  const seenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!invite || seenRef.current === invite.id) return;
    seenRef.current = invite.id;
    setError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [invite]);

  if (!invite) return null;
  const inviterName = invite.inviter?.displayName ?? invite.inviterName ?? 'Un amigo';
  const simulated = invite.partyId === 'sim';

  const join = async () => {
    setError(null);
    if (simulated) {
      answerSimInvite(true);
      router.navigate('/(tabs)/party');
      return;
    }
    try {
      await accept.mutateAsync(invite.id);
      router.navigate('/(tabs)/party');
    } catch (joinError) {
      setError(errorMessage(joinError, 'No pudimos unirte.'));
    }
  };

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.row}>
          <Avatar
            name={inviterName}
            color={profileColor(invite.inviter?.username ?? inviterName)}
            size={40}
            uri={invite.inviter?.avatarUrl ?? undefined}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {inviterName.split(' ')[0]} te invita a su convoy
            </AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {invite.partyName}
              {invite.destinationLabel ? ` · ${invite.destinationLabel}` : ''}
            </AppText>
          </View>
        </View>
        {error ? (
          <AppText variant="caption" color={colors.danger}>{error}</AppText>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => (simulated ? answerSimInvite(false) : decline.mutate(invite.id))}
            accessibilityRole="button"
          >
            <AppText variant="bodyStrong" color={colors.textSoft} style={{ fontSize: 14 }}>
              Ahora no
            </AppText>
          </Pressable>
          <Pressable
            style={[styles.button, styles.primary]}
            onPress={() => void join()}
            disabled={accept.isPending}
            accessibilityRole="button"
          >
            <Ionicons name="radio" size={16} color={colors.bg} />
            <AppText variant="bodyStrong" color={colors.bg} style={{ fontSize: 14 }}>
              {accept.isPending ? 'Uniéndote…' : 'Unirme'}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50, elevation: 50 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  secondary: { backgroundColor: colors.surfaceHigh },
  primary: { backgroundColor: colors.text },
});
