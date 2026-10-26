import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { achievements } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import { useMyProfile } from '@/src/hooks/useProfile';
import { privacyLabel, profileColor } from '@/src/lib/profile-db';
import { profileUrl } from '@/src/lib/qr';
import { startTracking, stopTracking } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSession } from '@/src/store/session';
import { colors, radius, spacing } from '@/src/theme';

const settings = [
  { icon: 'lock-closed-outline' as const, label: 'Privacidad y ubicación', value: 'Amigos' },
  { icon: 'speedometer-outline' as const, label: 'Unidades y moneda', value: 'km · DOP' },
  { icon: 'notifications-outline' as const, label: 'Notificaciones', value: 'Activadas' },
  { icon: 'shield-checkmark-outline' as const, label: 'Seguridad', value: '' },
  { icon: 'help-circle-outline' as const, label: 'Ayuda y soporte', value: '' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { profile } = useMyProfile();
  const { friends: friendEntries } = useFriends();
  const account = useAuth((state) => state.account);
  const signOut = useAuth((state) => state.signOut);
  const busy = useAuth((state) => state.busy);
  const trackingEnabled = useSession((state) => state.trackingEnabled);
  const setTrackingEnabled = useSession((state) => state.setTrackingEnabled);
  const isDemo = account?.mode === 'demo';
  const displayName = profile?.displayName || me.name;
  const username = profile?.username || me.username;
  const city = profile?.city || me.city;
  const bio = profile?.bio || me.bio;
  const privacy = profile?.privacy ?? (isDemo ? 'friends' : 'public');
  const avatarColor = profileColor(username);

  const shareProfile = async () => {
    await Share.share({
      message: `Mi perfil de Caravana: ${profileUrl(username)}`,
      url: profileUrl(username),
    });
  };

  const changeTracking = async (next: boolean) => {
    if (Platform.OS === 'web') {
      setTrackingEnabled(next);
      return;
    }
    try {
      if (next) await startTracking();
      else await stopTracking();
      setTrackingEnabled(next);
    } catch (error) {
      Alert.alert(
        'No se pudo cambiar el tracking',
        error instanceof Error ? error.message : 'Revisa los permisos de ubicación.',
      );
    }
  };

  const leaveSession = async () => {
    await signOut();
  };

  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      void leaveSession();
      return;
    }

    Alert.alert(
      isDemo ? 'Salir del modo demo' : 'Cerrar sesión',
      isDemo
        ? 'Volverás a la pantalla de bienvenida. Los datos de la demo siguen en este dispositivo.'
        : 'Tendrás que iniciar sesión de nuevo para acceder a tus rutas y tu garaje.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isDemo ? 'Salir' : 'Cerrar sesión',
          style: 'destructive',
          onPress: () => {
            void leaveSession();
          },
        },
      ],
    );
  };

  const profileSettings = settings.map((setting, index) =>
    index === 0 ? { ...setting, value: privacyLabel(privacy) } : setting,
  );

  return (
    <Screen contentStyle={{ paddingHorizontal: 0 }}>
      <LinearGradient
        colors={['#2B160F', '#151A21', '#06080B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cover}
      >
        <View style={styles.coverTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <AppText variant="label" color={colors.accent} style={{ letterSpacing: 2 }}>
              CARAVANA
            </AppText>
          </View>
          <View style={styles.coverActions}>
            <IconButton icon="qr-code-outline" size={38} onPress={() => router.push('/scan')} />
            <IconButton icon="settings-outline" size={38} />
          </View>
        </View>
        <View style={styles.coverPattern}>
          <View style={styles.coverLine} />
          <View style={[styles.coverLine, { transform: [{ rotate: '-18deg' }], top: 52 }]} />
          <View style={[styles.coverLine, { transform: [{ rotate: '12deg' }], top: 90 }]} />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            <Avatar
              name={displayName}
              color={avatarColor}
              size={86}
              uri={profile?.avatarUrl ?? me.avatarUrl}
              ring={colors.bg}
            />
            <View style={styles.carBadge}>
              <Ionicons name="car-sport" size={13} color="#120802" />
            </View>
          </View>
          <View style={styles.avatarActions}>
            <Button
              label="Editar perfil"
              variant="secondary"
              size="sm"
              icon="create-outline"
              full={false}
              onPress={() => router.push('/profile/edit')}
            />
            <IconButton icon="share-social-outline" size={38} onPress={shareProfile} />
          </View>
        </View>

        <View style={styles.identity}>
          <AppText variant="h1">{displayName}</AppText>
          <View style={styles.usernameRow}>
            <AppText variant="caption" color={colors.accent}>@{username}</AppText>
            <View style={styles.metaDot} />
            <Ionicons name="location-outline" size={12} color={colors.muted} />
            <AppText variant="caption" color={colors.muted}>{city}</AppText>
          </View>
          <AppText variant="body" color={colors.textSoft} style={{ marginTop: 8 }}>
            {bio}
          </AppText>
        </View>

        <Card style={styles.statsCard}>
          <View style={styles.statItem}>
            <Stat value={String(me.stats.drives)} label="rutas" align="center" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Stat value={`${(me.stats.km / 1000).toFixed(1)}k`} label="kilómetros" align="center" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Stat value={`${me.stats.hours} h`} label="al volante" align="center" />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Stat value={String(friendEntries.length)} label="amigos" accent={colors.lime} align="center" />
          </View>
        </Card>

        <View style={styles.sectionPad}>
          <SectionHeader title="Mi QR" action="Compartir" onAction={shareProfile} />
          <View style={styles.qrWrap}>
            <QRCard
              value={profileUrl(username)}
              label="PERFIL"
              caption={`@${username}`}
              size={148}
            />
            <View style={styles.qrActions}>
              <Button label="Compartir perfil" icon="share-outline" onPress={shareProfile} />
              <Button
                label="Escanear un QR"
                icon="scan-outline"
                variant="secondary"
                onPress={() => router.push('/scan')}
              />
              <View style={styles.qrHint}>
                <Ionicons name="sparkles" size={15} color={colors.lime} />
                <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                  Pega tu QR en el coche para que otros vean tu perfil al instante.
                </AppText>
              </View>
            </View>
          </View>

          <SectionHeader title="Logros" action="Ver todos" />
          <View style={styles.achievements}>
            {achievements.map((achievement) => (
              <View key={achievement.id} style={styles.achievement}>
                <View style={styles.achievementIcon}>
                  <Ionicons name={achievement.icon} size={18} color={colors.lime} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{achievement.title}</AppText>
                  <AppText variant="caption" color={colors.muted}>{achievement.detail}</AppText>
                </View>
              </View>
            ))}
          </View>

          <SectionHeader
            title="Amigos"
            action="Ver todos"
            onAction={() => router.push('/friends')}
          />
          {friendEntries.length === 0 ? (
            <Card style={styles.friendsEmpty}>
              <View style={styles.friendAdd}>
                <Ionicons name="people-outline" size={20} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Tu caravana está empezando</AppText>
                <AppText variant="caption" color={colors.muted}>
                  Busca amigos por @usuario o comparte tu QR.
                </AppText>
              </View>
              <Button
                label="Buscar"
                size="sm"
                full={false}
                onPress={() => router.push('/friends')}
              />
            </Card>
          ) : (
            <View style={styles.friendRow}>
              {friendEntries.slice(0, 5).map((friend) => (
                <View key={friend.id} style={styles.friend}>
                  <Avatar
                    name={friend.profile.displayName}
                    color={profileColor(friend.profile.username)}
                    size={46}
                    uri={friend.profile.avatarUrl ?? undefined}
                  />
                  <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                    {friend.profile.displayName.split(' ')[0]}
                  </AppText>
                </View>
              ))}
              <Pressable onPress={() => router.push('/friends')} style={styles.friendAdd}>
                <Ionicons name="add" size={20} color={colors.muted} />
              </Pressable>
            </View>
          )}

          <SectionHeader title="Cuenta" />
          <Card style={styles.settingsCard}>
            <View style={styles.settingRow}>
              <View
                style={[
                  styles.settingIcon,
                  isDemo ? { backgroundColor: colors.limeSoft } : { backgroundColor: 'rgba(46,230,168,0.12)' },
                ]}
              >
                <Ionicons
                  name={isDemo ? 'flask-outline' : 'cloud-done-outline'}
                  size={17}
                  color={isDemo ? colors.lime : colors.green}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">
                  {isDemo ? 'Modo demo' : 'Cuenta conectada'}
                </AppText>
                <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                  {account?.email ?? 'Sesión local'}
                </AppText>
              </View>
              <Pill
                label={isDemo ? 'Local' : 'Sync'}
                tone={isDemo ? 'neutral' : 'lime'}
                icon={isDemo ? 'phone-portrait-outline' : 'cloud-outline'}
              />
            </View>
            {isDemo ? (
              <>
                <View style={styles.settingDivider} />
                <View style={styles.demoHint}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
                  <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                    Estás explorando con datos locales. Crea una cuenta para conservar
                    tu perfil, garaje y rutas en la nube.
                  </AppText>
                </View>
              </>
            ) : null}
          </Card>

          <SectionHeader title="Ajustes" />
          <Card style={styles.settingsCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="navigate-outline" size={17} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Tracking automático</AppText>
                <AppText variant="caption" color={colors.muted}>
                  Detecta y guarda tus rutas
                </AppText>
              </View>
              <Switch
                value={trackingEnabled}
                onValueChange={changeTracking}
                trackColor={{ false: colors.surfaceHigh, true: colors.accent }}
                thumbColor={trackingEnabled ? colors.white : colors.muted}
              />
            </View>
            <View style={styles.settingDivider} />
            {profileSettings.map((setting, index) => (
              <View key={setting.label}>
                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name={setting.icon} size={17} color={colors.textSoft} />
                  </View>
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>{setting.label}</AppText>
                  {setting.value ? (
                    <AppText variant="caption" color={colors.muted}>{setting.value}</AppText>
                  ) : null}
                  <Ionicons name="chevron-forward" size={14} color={colors.dim} />
                </View>
                {index < settings.length - 1 ? <View style={styles.settingDivider} /> : null}
              </View>
            ))}
          </Card>

          <Button
            label={isDemo ? 'Salir del modo demo' : 'Cerrar sesión'}
            icon="log-out-outline"
            variant="ghost"
            loading={busy}
            onPress={confirmSignOut}
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.footer}>
            <Pill label="Caravana v0.1 · MVP" tone="neutral" />
            <AppText variant="caption" color={colors.dim} align="center" style={{ marginTop: 10 }}>
              Hecho para la carretera. Tu ubicación solo se comparte dentro de una party.
            </AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: 190,
    marginTop: -spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  coverTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  coverActions: { flexDirection: 'row', gap: 8 },
  coverPattern: { position: 'absolute', left: -20, right: 0, bottom: 0, top: 0, opacity: 0.35 },
  coverLine: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: 110,
    height: 1,
    backgroundColor: 'rgba(255,90,31,0.4)',
  },
  body: { paddingHorizontal: spacing.xl, marginTop: -36 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  avatarWrap: { position: 'relative' },
  carBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lime,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  identity: { marginTop: spacing.md },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim, marginHorizontal: 2 },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  sectionPad: {},
  qrWrap: { gap: spacing.md },
  qrActions: { gap: 8 },
  qrHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(201,255,77,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.14)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  achievements: { gap: 8 },
  achievement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  achievementIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  friendsEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  friend: { alignItems: 'center', gap: 5, width: 48 },
  friendAdd: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  settingsCard: { paddingVertical: 4, paddingHorizontal: spacing.md },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingDivider: { height: 1, backgroundColor: colors.borderSoft, marginLeft: 42 },
  demoHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: spacing.md,
    paddingLeft: 42,
  },
  footer: { alignItems: 'center', marginTop: spacing['2xl'], marginBottom: spacing.xl },
});
