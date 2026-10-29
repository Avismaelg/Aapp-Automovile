import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import { AppText, Avatar, Button, Card, IconButton, Pill } from '@/src/components/ui';
import { activeParty, partyMembers } from '@/src/data/mock';
import { useJoinParty } from '@/src/hooks/useParty';
import { errorMessage } from '@/src/lib/alerts';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';

export default function JoinPartyScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const account = useAuth((state) => state.account);
  const isDemo = account?.mode === 'demo';
  const joinParty = useJoinParty();
  const [error, setError] = useState<string | null>(null);
  const inviteCode = (code || activeParty.code).toUpperCase();

  const join = async () => {
    setError(null);
    try {
      await joinParty.mutateAsync(inviteCode);
      router.replace('/(tabs)/party');
    } catch (joinError) {
      setError(
        errorMessage(joinError, 'No pudimos unirnos a la party.'),
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
        <IconButton icon="close" onPress={() => router.back()} />
        <Pill label="Invitación" tone="accent" icon="mail-open" />
        <View style={{ width: 42 }} />
      </View>

      {error ? <AuthNotice message={error} /> : null}

      <LinearGradient
        colors={['#2B160F', '#151A21', '#0B0F14']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.glow} />
        <View style={styles.iconWrap}>
          <Ionicons name="radio" size={30} color={colors.accent} />
        </View>
        <AppText variant="label" color={colors.accent} style={{ marginTop: spacing.lg }}>
          TE INVITAN A UNA PARTY
        </AppText>
        <AppText variant="h1" align="center" style={{ marginTop: 6 }}>
          {isDemo ? activeParty.name : 'Party de Caravana'}
        </AppText>
        <View style={styles.destination}>
          <Ionicons name="location" size={14} color={colors.textSoft} />
          <AppText variant="caption" color={colors.textSoft}>
            {isDemo ? activeParty.destination : 'La ubicación se comparte al entrar'}
          </AppText>
        </View>

        <View style={styles.codeBox}>
          <AppText variant="label" color={colors.muted}>Código</AppText>
          <AppText variant="h2" color={colors.lime} style={{ letterSpacing: 4 }}>
            {inviteCode}
          </AppText>
        </View>

        {isDemo ? (
          <View style={styles.members}>
            {partyMembers.slice(0, 4).map((member, index) => (
              <View key={member.id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
                <Avatar
                  name={member.name}
                  color={member.color}
                  size={38}
                  ring={colors.bgElevated}
                />
              </View>
            ))}
            <AppText variant="caption" color={colors.muted} style={{ marginLeft: 8 }}>
              {partyMembers.length} personas ya están en ruta
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: spacing.md }}>
            Al unirte compartirás tu ubicación con los miembros y podrás usar el chat.
          </AppText>
        )}

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Ionicons name="car-sport" size={18} color={colors.accent} />
            <AppText variant="h3">{isDemo ? `${activeParty.distanceKm} km` : 'En vivo'}</AppText>
            <AppText variant="caption" color={colors.muted}>caravana</AppText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaCell}>
            <Ionicons name="time-outline" size={18} color={colors.lime} />
            <AppText variant="h3">{isDemo ? `${activeParty.etaMin} min` : 'GPS'}</AppText>
            <AppText variant="caption" color={colors.muted}>posiciones</AppText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaCell}>
            <Ionicons name="mic-outline" size={18} color={colors.cyan} />
            <AppText variant="h3">PTT</AppText>
            <AppText variant="caption" color={colors.muted}>walkie-talkie</AppText>
          </View>
        </View>

        <Button
          label={joinParty.isPending ? 'Uniéndome…' : 'Unirme a la party'}
          icon="radio"
          loading={joinParty.isPending}
          onPress={() => {
            if (isDemo) router.replace('/(tabs)/party');
            else void join();
          }}
          style={{ marginTop: spacing.xl }}
        />
        <Button
          label="Ahora no"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginTop: 8 }}
        />
      </LinearGradient>

      <Card style={styles.note}>
        <Ionicons name="shield-checkmark" size={20} color={colors.lime} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
          Tu ubicación solo se comparte con los miembros mientras la party esté activa.
          Al terminarla, se deja de emitir y el historial se borra a los 30 días.
        </AppText>
      </Card>

        <View style={styles.footer}>
          <AppText variant="caption" color={colors.dim} align="center">
            ¿No esperabas esta invitación? Bloquea al host desde su perfil.
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  card: {
    marginTop: spacing.xl,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.24)',
    padding: spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  codeBox: {
    marginTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  members: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: spacing.md,
    paddingVertical: 5,
  },
  metaGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  metaCell: { flex: 1, alignItems: 'center', gap: 3 },
  metaDivider: { width: 1, height: 40, backgroundColor: colors.border },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: spacing.lg,
  },
  footer: { marginTop: spacing.lg, paddingBottom: spacing.sm },
});
