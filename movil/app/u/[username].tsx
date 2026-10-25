import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Stat,
} from '@/src/components/ui';
import { currentUser, friends } from '@/src/data/mock';
import { profileUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';

export default function PublicProfileScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = (username || currentUser.username).replace('@', '');
  const isMe = handle === currentUser.username;
  const friend = friends.find((item) => item.username === handle);

  const name = isMe ? currentUser.name : friend?.name ?? 'Luis Martínez';
  const color = isMe ? currentUser.color : friend?.color ?? colors.accent;
  const car = isMe
    ? `${currentUser.car.make} ${currentUser.car.model} ${currentUser.car.year}`
    : friend?.car ?? 'Honda Civic Si 2020';
  const city = isMe ? currentUser.city : 'Santo Domingo, RD';
  const bio = isMe
    ? currentUser.bio
    : 'Rutas de fin de semana, café y buenas curvas. Siempre en caravana.';

  const share = async () => {
    await Share.share({
      message: `Perfil de ${name} en Caravana: ${profileUrl(handle)}`,
      url: profileUrl(handle),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        <View style={styles.header}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Pill label="Perfil verificado por QR" tone="lime" icon="shield-checkmark" />
        <IconButton icon="share-social-outline" onPress={share} />
      </View>

      <View style={styles.hero}>
        <LinearGradient
          colors={['#2B160F', '#151A21', '#0B0F14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBg}
        >
          <View style={styles.heroLine} />
        </LinearGradient>
        <View style={styles.heroContent}>
          <Avatar name={name} color={color} size={88} ring={colors.bg} />
          <AppText variant="h1" align="center" style={{ marginTop: spacing.md }}>
            {name}
          </AppText>
          <AppText variant="caption" color={colors.accent} align="center">
            @{handle}
          </AppText>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <AppText variant="caption" color={colors.muted}>{city}</AppText>
            <View style={styles.dot} />
            <Ionicons name="car-sport-outline" size={13} color={colors.muted} />
            <AppText variant="caption" color={colors.muted}>{car}</AppText>
          </View>
          <AppText variant="body" color={colors.textSoft} align="center" style={{ marginTop: 10 }}>
            {bio}
          </AppText>

          <View style={styles.actions}>
            {isMe ? (
              <Button label="Compartir mi perfil" icon="share-outline" onPress={share} />
            ) : (
              <Button label="Añadir amigo" icon="person-add-outline" onPress={() => {}} />
            )}
            <Button
              label="Ver garaje"
              variant="secondary"
              icon="car-sport-outline"
              onPress={() => router.push('/(tabs)/garage')}
            />
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Card style={styles.stats}>
          <View style={styles.statItem}>
            <Stat value="128" label="rutas" align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat value="12.4k" label="km" align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat value="42" label="amigos" accent={colors.lime} align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat value="3" label="retos" accent={colors.accent} align="center" />
          </View>
        </Card>

        <View style={styles.qrRow}>
          <QRCard
            value={profileUrl(handle)}
            label="PÚBLICO"
            caption={`@${handle}`}
            size={118}
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Card style={styles.privacyCard}>
              <View style={styles.privacyIcon}>
                <Ionicons name="eye-off-outline" size={18} color={colors.lime} />
              </View>
              <AppText variant="bodyStrong" style={{ marginTop: 8 }}>
                Privacidad primero
              </AppText>
              <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
                Solo ves lo que {isMe ? 'tú' : name.split(' ')[0]} decide compartir. La ubicación
                en vivo nunca aparece aquí.
              </AppText>
            </Card>
            <PressableRow icon="flag-outline" label="Reportar perfil" onPress={() => {}} />
          </View>
        </View>

        <Card style={styles.carCard}>
          <View style={styles.carIcon}>
            <Ionicons name="car-sport" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{car}</AppText>
            <AppText variant="caption" color={colors.muted}>
              Coche principal · 128 rutas registradas
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.dim} />
        </Card>

        <View style={styles.footerNote}>
          <Ionicons name="qr-code-outline" size={15} color={colors.dim} />
          <AppText variant="caption" color={colors.dim} align="center">
            Escaneaste el QR de {name.split(' ')[0]}. Los perfiles privados solo muestran una
            tarjeta mínima.
          </AppText>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PressableRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.reportRow}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>{label}</AppText>
      <Ionicons name="chevron-forward" size={13} color={colors.dim} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  hero: { marginTop: spacing.lg },
  heroBg: {
    height: 160,
    marginHorizontal: spacing.xl,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.2)',
    overflow: 'hidden',
  },
  heroLine: {
    position: 'absolute',
    left: -30,
    right: -30,
    top: 90,
    height: 1,
    backgroundColor: 'rgba(255,90,31,0.35)',
    transform: [{ rotate: '-8deg' }],
  },
  heroContent: {
    marginTop: -44,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap', justifyContent: 'center' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim, marginHorizontal: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, alignSelf: 'stretch' },
  body: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  statItem: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 30, backgroundColor: colors.border },
  qrRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  privacyCard: { flex: 1, padding: spacing.md },
  privacyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  carIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
