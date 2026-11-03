import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Pill } from '@/src/components/ui';
import { RouteMini } from '@/src/components/challenges/RouteMini';
import type { Challenge, ChallengeParticipant } from '@/src/types/models';
import { countdownSeconds } from '@/src/lib/challenge-db';
import { formatClock } from '@/src/lib/format';
import { vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';
import { formatKmValue, t } from '@/src/i18n';

type Props = {
  active: Challenge;
  standings: ChallengeParticipant[];
  isDemo: boolean;
  activeIsInvite: boolean;
  activeIsWaiting: boolean;
  activeIsHost: boolean;
  activeHostReady: boolean;
  activeReadyToStart: boolean;
  respondPending: boolean;
  startPending: boolean;
  finishPending: boolean;
  onRespond: (accept: boolean) => void;
  onStart: () => void;
  onFinish: () => void;
  onShare: () => void;
  // RETO-07 / RETO-08.
  onAbandon?: () => void;
  onPublish?: () => void;
  abandonPending?: boolean;
  publishPending?: boolean;
};

// RETO-04: cuenta atrás hasta la salida (se repinta cada 250 ms).
function useCountdown(startsAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const left = countdownSeconds(startsAt ?? null, now);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [left]);
  return left;
}

// Reto en curso, pendiente o terminado con sus acciones según tu papel.
export function ActiveChallengeCard({
  active,
  standings,
  isDemo,
  activeIsInvite,
  activeIsWaiting,
  activeIsHost,
  activeHostReady,
  activeReadyToStart,
  respondPending,
  startPending,
  finishPending,
  onRespond,
  onStart,
  onFinish,
  onShare,
  onAbandon,
  onPublish,
  abandonPending,
  publishPending,
}: Props) {
  const countdown = useCountdown(active.startsAt);
  const myState = standings.find((participant) => participant.isMe)?.state;
  return (
    <LinearGradient
      colors={['#2A170F', '#17181D', '#0E1217']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.liveCard}
    >
      <View style={styles.liveGlow} />
      <View style={styles.liveTop}>
        <Pill
          label={
            active.status === 'live'
              ? t('Reto en vivo')
              : active.status === 'pending'
                ? activeIsInvite
                  ? t('Invitación recibida')
                  : activeIsWaiting
                    ? t('Esperando salida')
                    : t('Invitación pendiente')
                : t('Reto finalizado')
          }
          tone={
            active.status === 'live'
              ? 'danger'
              : active.status === 'pending'
                ? 'accent'
                : 'neutral'
          }
          icon={
            active.status === 'live'
              ? 'radio'
              : active.status === 'pending'
                ? activeIsWaiting
                  ? 'time-outline'
                  : 'mail-unread'
                : 'checkmark-circle'
          }
        />
        <Pill
          label={active.category === 'mixed' ? t('Mixto') : vehicleKindMeta[active.category].shortLabel}
          tone="dark"
        />
      </View>

      <AppText variant="h2" style={{ marginTop: spacing.lg }}>{active.title}</AppText>
      <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
        {active.status === 'live'
          ? activeIsInvite
            ? t('Sala en marcha. Acepta para unirte a la salida.')
            : t('{0} · {1} participantes · código {2}', active.mode === 'instant' ? t('Sala rápida') : t('En curso'), standings.length, active.code)
          : active.status === 'pending'
            ? activeIsInvite
              ? t('Te invitaron a este reto. Acepta para unirte.')
              : activeIsWaiting
                ? t('Estás dentro. El anfitrión iniciará la salida.')
                : activeReadyToStart
                  ? t('Ya hay rivales listos. Puedes iniciar la salida.')
                  : activeHostReady
                    ? t('No hay rivales aceptados. Invita a otro piloto.')
                    : t('Esperando que tus rivales acepten el reto')
            : t('Resultado final del reto')}
      </AppText>

      <RouteMini
        fromLabel={active.fromLabel}
        toLabel={active.toLabel}
        distanceKm={active.distanceKm}
      />

      <View style={styles.liveStats}>
        <View style={[styles.liveStat, styles.liveStatTime]}>
          <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>{t('TIEMPO')}</AppText>
          <AppText
            variant="mono"
            color={colors.accent}
            numberOfLines={1}
            style={{ fontSize: 15 }}
          >
            {formatClock(active.elapsedSeconds)}
          </AppText>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveStat}>
          <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>{t('DISTANCIA')}</AppText>
          <AppText variant="h3" numberOfLines={1} style={{ fontSize: 18 }}>
            {formatKmValue(active.distanceKm, 1)}
          </AppText>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveStat}>
          <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>{t('LÍDER')}</AppText>
          <AppText variant="h3" color={colors.lime} numberOfLines={1} style={{ fontSize: 18 }}>
            {standings[0]?.isMe ? t('Tú') : standings[0]?.name.split(' ')[0] ?? '—'}
          </AppText>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveStat}>
          <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>{t('CATEGORÍA')}</AppText>
          <AppText variant="h3" numberOfLines={1} style={{ fontSize: 18 }}>
            {active.category === 'mixed' ? t('Mixto') : vehicleKindMeta[active.category].shortLabel}
          </AppText>
        </View>
      </View>

      {countdown > 0 ? (
        <View style={styles.countdown} accessibilityLiveRegion="assertive">
          <AppText variant="label" color={colors.muted}>{t('SALIDA EN')}</AppText>
          <AppText variant="h1" color={colors.accent} style={styles.countdownNumber}>
            {String(countdown)}
          </AppText>
          <AppText variant="caption" color={colors.muted}>{t('Respeta las leyes de tránsito.')}</AppText>
        </View>
      ) : null}

      <View style={styles.liveActions}>
        {activeIsInvite ? (
          <>
            <Button
              label={t('Aceptar reto')}
              icon="checkmark-circle-outline"
              loading={respondPending}
              onPress={() => onRespond(true)}
              style={{ flex: 1 }}
            />
            <Button
              label={t('Rechazar')}
              icon="close"
              variant="secondary"
              full={false}
              onPress={() => onRespond(false)}
              style={{ paddingHorizontal: 16 }}
            />
          </>
        ) : active.status === 'pending' && activeIsWaiting ? (
          <>
            <Button
              label={t('Esperando al anfitrión')}
              icon="time-outline"
              disabled
              style={{ flex: 1 }}
            />
            <Button
              label={t('Compartir')}
              icon="share-social-outline"
              variant="secondary"
              full={false}
              onPress={onShare}
              style={{ paddingHorizontal: 16 }}
            />
          </>
        ) : active.status === 'pending' ? (
          <>
            <Button
              label={t('Iniciar reto')}
              icon="flag"
              loading={startPending}
              disabled={!isDemo && !activeReadyToStart}
              onPress={() => onStart()}
              style={{ flex: 1 }}
            />
            <Button
              label={t('Compartir')}
              icon="share-social-outline"
              variant="secondary"
              full={false}
              onPress={onShare}
              style={{ paddingHorizontal: 16 }}
            />
          </>
        ) : active.status === 'live' && onAbandon && myState === 'racing' && !activeIsHost ? (
          <>
            <Button
              label={t('Compartir reto')}
              icon="share-social-outline"
              onPress={onShare}
              style={{ flex: 1 }}
            />
            <Button
              label={t('Abandonar')}
              icon="exit-outline"
              variant="secondary"
              full={false}
              loading={abandonPending}
              onPress={onAbandon}
              style={{ paddingHorizontal: 16 }}
            />
          </>
        ) : active.status === 'live' ? (
          <>
            <Button
              label={activeIsHost ? t('Finalizar reto') : t('Compartir reto')}
              icon={activeIsHost ? 'stop-circle-outline' : 'share-social-outline'}
              loading={activeIsHost ? finishPending : false}
              onPress={() => activeIsHost ? onFinish() : onShare()}
              style={{ flex: 1 }}
            />
            {activeIsHost ? (
              <Button
                label={t('Compartir')}
                icon="share-social-outline"
                variant="secondary"
                full={false}
                onPress={onShare}
                style={{ paddingHorizontal: 16 }}
              />
            ) : null}
          </>
        ) : (
          <>
            <Button
              label={t('Compartir resultado')}
              icon="share-outline"
              onPress={onShare}
              style={{ flex: 1 }}
            />
            {onPublish ? (
              <Button
                label={t('Al feed')}
                icon="newspaper-outline"
                variant="secondary"
                full={false}
                loading={publishPending}
                onPress={onPublish}
                style={{ paddingHorizontal: 16 }}
              />
            ) : null}
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  countdown: { alignItems: 'center', paddingVertical: spacing.lg, gap: 2 },
  countdownNumber: { fontSize: 64, lineHeight: 70 },
  liveCard: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.25)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  liveGlow: {
    position: 'absolute',
    top: -150,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  liveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  liveStat: { flex: 1, gap: 2 },
  liveStatTime: { flex: 1.45 },
  liveDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 8 },
  liveActions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
});
