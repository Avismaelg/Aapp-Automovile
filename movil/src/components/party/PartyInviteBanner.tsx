import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Avatar } from '@/src/components/ui';
import {
  useAcceptPartyInvite,
  useDeclinePartyInvite,
  useIncomingPartyInvites,
  type IncomingPartyInvite,
} from '@/src/hooks/usePartyInvites';
import { errorMessage } from '@/src/lib/alerts';
import { INVITE_ANSWER_MS } from '@/src/lib/party-invites';
import { markAlertsSeen } from '@/src/lib/background-alerts';
import { profileColor } from '@/src/lib/profile-db';
import { answerSimInvite, useSimulator } from '@/src/lib/simulator';
import { useChallenges, useRespondChallenge } from '@/src/hooks/useChallenges';
import { useChosenDestination } from '@/src/store/destination';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// Invitaciones que caducaron sin respuesta en esta sesión (no vuelven a salir
// aunque el servidor tarde en enterarse).
const expiredInvites = new Set<string>();

// Aviso en cualquier pantalla cuando un amigo te invita: «Unirme» te mete en
// su party y abre la pestaña Party. Hay 15 s para responder; luego desaparece.
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
  const [, setExpiredCount] = useState(0);
  const invite = invites.find((item) => !expiredInvites.has(item.id));
  const seenRef = useRef<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(INVITE_ANSWER_MS / 1000);
  const [countdown] = useState(() => new Animated.Value(1));
  const declineRef = useRef(decline.mutate);
  useEffect(() => {
    declineRef.current = decline.mutate;
  }, [decline.mutate]);

  // Cuenta atrás: barra que se vacía y, a cero, la invitación caduca (queda
  // como no aceptada para que el anfitrión pueda volver a invitar).
  const inviteId = invite?.id;
  useEffect(() => {
    if (!inviteId) return;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((INVITE_ANSWER_MS - (Date.now() - startedAt)) / 1000));
      setSecondsLeft(left);
    }, 250);
    countdown.setValue(1);
    Animated.timing(countdown, {
      toValue: 0,
      duration: INVITE_ANSWER_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    const expire = setTimeout(() => {
      expiredInvites.add(inviteId);
      setExpiredCount(expiredInvites.size);
      if (inviteId.startsWith('sim-')) answerSimInvite(false);
      else declineRef.current(inviteId);
    }, INVITE_ANSWER_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(expire);
      countdown.stopAnimation();
      setSecondsLeft(INVITE_ANSWER_MS / 1000);
    };
  }, [inviteId, countdown]);

  useEffect(() => {
    if (!invite || seenRef.current === invite.id) return;
    seenRef.current = invite.id;
    void markAlertsSeen([`invite:${invite.id}:${invite.createdAt}`]);
    setError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [invite]);

  if (!invite) return <ChallengeInviteBanner />;
  const inviterName = invite.inviter?.displayName ?? invite.inviterName ?? t('Un amigo');
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
      setError(errorMessage(joinError, t('No pudimos unirte.')));
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
              {inviterName.split(' ')[0]}{' '}{t('te invita a su convoy')}
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
        <View style={styles.countdownRow}>
          <View style={styles.countdownTrack}>
            <Animated.View style={[styles.countdownFill, { transform: [{ scaleX: countdown }] }]} />
          </View>
          <AppText variant="caption" color={colors.muted} style={styles.countdownText}>
            {t('{0} s', secondsLeft)}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => (simulated ? answerSimInvite(false) : decline.mutate(invite.id))}
            accessibilityRole="button"
          >
            <AppText variant="bodyStrong" color={colors.textSoft} style={{ fontSize: 14 }}>
              {t('Ahora no')}
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
              {accept.isPending ? t('Uniéndote…') : t('Unirme')}
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
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countdownTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  // Se encoge hacia la izquierda: el origen de la escala es el centro, así que
  // la barra ocupa el doble y se desplaza media anchura.
  countdownFill: {
    width: '200%',
    height: '100%',
    marginLeft: '-100%',
    backgroundColor: colors.accent,
  },
  countdownText: { minWidth: 28, textAlign: 'right' },
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

// Un amigo te reta (también desde la party). Aceptar te pone la ruta a la meta.
function ChallengeInviteBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { invitations } = useChallenges();
  const respond = useRespondChallenge();
  const [hidden, setHidden] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const challenge = invitations.find((item) => item.id !== hidden);
  const challengeId = challenge?.id;
  useEffect(() => {
    if (challengeId) void markAlertsSeen([`challenge:${challengeId}`]);
  }, [challengeId]);
  if (!challenge) return null;
  const host = challenge.participants.find((participant) => participant.isHost);
  const hostName = host?.profile.displayName ?? t('Un piloto');

  const answer = async (accept: boolean) => {
    setError(null);
    try {
      await respond.mutateAsync({ challengeId: challenge.id, accept });
      setHidden(challenge.id);
      if (accept && challenge.endLat != null && challenge.endLng != null) {
        const store = useChosenDestination.getState();
        store.setDestination({
          latitude: challenge.endLat,
          longitude: challenge.endLng,
          label: challenge.toLabel,
          personal: true,
        });
        store.startNavigation();
        router.navigate('/(tabs)');
      }
    } catch (respondError) {
      setError(errorMessage(respondError, t('No pudimos responder.')));
    }
  };

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.row}>
          <Avatar
            name={hostName}
            color={profileColor(host?.profile.username ?? hostName)}
            size={40}
            uri={host?.profile.avatarUrl ?? undefined}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {hostName.split(' ')[0]}{' '}{t('te reta')}
            </AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {t('Llegar primero a')}{' '}{challenge.toLabel}
            </AppText>
          </View>
        </View>
        {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => void answer(false)}
            accessibilityRole="button"
          >
            <AppText variant="bodyStrong" color={colors.textSoft} style={{ fontSize: 14 }}>
              {t('Rechazar')}
            </AppText>
          </Pressable>
          <Pressable
            style={[styles.button, styles.primary]}
            onPress={() => void answer(true)}
            disabled={respond.isPending}
            accessibilityRole="button"
          >
            <Ionicons name="flag" size={16} color={colors.bg} />
            <AppText variant="bodyStrong" color={colors.bg} style={{ fontSize: 14 }}>
              {respond.isPending ? 'Aceptando…' : t('Aceptar e ir')}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
