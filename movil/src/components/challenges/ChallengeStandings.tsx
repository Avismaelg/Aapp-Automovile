import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Card, SectionHeader } from '@/src/components/ui';
import type { Challenge, ChallengeParticipant } from '@/src/types/models';
import { vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

export function ChallengeStandings({
  standings,
  status,
}: {
  standings: ChallengeParticipant[];
  status: Challenge['status'];
}) {
  return (
    <>
      <SectionHeader title="Clasificación" action={status === 'live' ? 'En vivo' : undefined} />
      <Card style={styles.standingsCard}>
        {standings.map((participant, index) => {
          const kind = vehicleKindMeta[participant.vehicleKind];
          return (
            <View
              key={participant.id}
              style={[styles.standingRow, participant.isMe && styles.standingMe]}
            >
              <View style={[styles.rank, index === 0 && styles.rankFirst]}>
                <AppText variant="label" color={index === 0 ? '#120802' : colors.muted} style={{ fontSize: 10 }}>
                  {index + 1}
                </AppText>
              </View>
              <Avatar name={participant.name} color={participant.color} size={38} online />
              <View style={styles.standingMain}>
                <View style={styles.standingNameRow}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {participant.isMe ? 'Tú' : participant.name.split(' ')[0]}
                  </AppText>
                  <View style={[styles.kindBadge, { borderColor: `${kind.color}55` }]}>
                    <Ionicons name={kind.icon} size={10} color={kind.color} />
                    <AppText variant="label" color={kind.color} style={{ fontSize: 8 }}>
                      {kind.shortLabel.toUpperCase()}
                    </AppText>
                  </View>
                </View>
                <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                  {participant.vehicle}
                </AppText>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${participant.progress}%`,
                        backgroundColor: participant.isMe ? colors.accent : kind.color,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.standingRight}>
                <AppText variant="bodyStrong" color={participant.isMe ? colors.accent : colors.text}>
                  {participant.progress}%
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {status === 'finished' ? 'llegada' : `ETA ${participant.etaMin} m`}
                </AppText>
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  standingsCard: { paddingVertical: 4, paddingHorizontal: spacing.md },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  standingMe: {},
  rank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: { backgroundColor: colors.lime },
  standingMain: { flex: 1, minWidth: 0 },
  standingNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  standingRight: { alignItems: 'flex-end', minWidth: 52 },
});
