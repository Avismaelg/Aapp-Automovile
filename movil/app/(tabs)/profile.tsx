import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  IconButton,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { achievements as demoAchievements } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import { useMyProfile } from '@/src/hooks/useProfile';
import { tripAchievements, tripStats } from '@/src/lib/achievements';
import { showError } from '@/src/lib/alerts';
import { shareDiagnostic } from '@/src/lib/diagnostics';
import { privacyLabel, profileColor } from '@/src/lib/profile-db';
import { profileUrl } from '@/src/lib/qr';
import { startTracking, stopTracking } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSession } from '@/src/store/session';
import { useSharing } from '@/src/store/sharing';
import { useTrips } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';
import { restartApp } from '@/modules/motion';
import { SHARE_OUTSIDE_PARTY } from '@/src/lib/party-invites';
import {
  distanceUnit,
  getCurrency,
  getLanguagePreference,
  kmToDisplay,
  saveLanguagePreference,
  t,
  type LanguagePreference,
} from '@/src/i18n';

// Los idiomas se nombran en su propio idioma, para encontrarlos aunque no
// entiendas el actual.
const LANGUAGE_NAMES: Record<Exclude<LanguagePreference, 'auto'>, string> = {
  es: 'Español',
  en: 'English',
};

function languageLabel(preference: LanguagePreference) {
  return preference === 'auto' ? t('Automático') : LANGUAGE_NAMES[preference];
}

const settings = [
  { icon: 'lock-closed-outline' as const, label: t('Privacidad y ubicación'), value: t('Amigos') },
  { icon: 'speedometer-outline' as const, label: t('Unidades y moneda'), value: `${distanceUnit()} · ${getCurrency()}` },
  { icon: 'notifications-outline' as const, label: t('Notificaciones'), value: t('Activadas') },
  { icon: 'shield-checkmark-outline' as const, label: t('Seguridad'), value: '' },
  { icon: 'help-circle-outline' as const, label: t('Ayuda y soporte'), value: '' },
  { icon: 'document-text-outline' as const, label: t('Política de privacidad'), value: '' },
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
  const [showQr, setShowQr] = useState(false);
  const shareWithFriends = useSharing((state) => state.shareWithFriends);
  const setShareWithFriends = useSharing((state) => state.setShareWithFriends);
  const isDemo = account?.mode === 'demo';
  const trips = useTrips((state) => state.trips);
  const tripTotals = useTrips((state) => state.totals);
  const achievements = isDemo ? demoAchievements : tripAchievements(trips, tripTotals);
  const stats = isDemo ? me.stats : tripStats(tripTotals);
  const displayName = profile?.displayName || me.name;
  const username = profile?.username || me.username;
  const city = profile?.city || me.city;
  const bio = profile?.bio || me.bio;
  const privacy = profile?.privacy ?? (isDemo ? 'friends' : 'public');
  const avatarColor = profileColor(username);

  const shareProfile = async () => {
    await Share.share({
      message: t('Mi perfil de Caravana: {0}', profileUrl(username)),
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
      showError(t('No se pudo cambiar el tracking'), error, t('Revisa los permisos de ubicación.'));
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
      isDemo ? t('Salir del modo demo') : t('Cerrar sesión'),
      isDemo
        ? t('Volverás a la pantalla de bienvenida. Los datos de la demo siguen en este dispositivo.')
        : t('Tendrás que iniciar sesión de nuevo para acceder a tus rutas y tu garaje.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: isDemo ? t('Salir') : t('Cerrar sesión'),
          style: 'destructive',
          onPress: () => {
            void leaveSession();
          },
        },
      ],
    );
  };

  const [language, setLanguage] = useState(getLanguagePreference);

  const applyLanguage = (next: LanguagePreference) => {
    setLanguage(next);
    if (!saveLanguagePreference(next)) return;
    // Muchos textos se calculan al arrancar: se reinicia para que todo cambie.
    if (!restartApp()) {
      Alert.alert(t('Idioma'), t('Cierra y vuelve a abrir Caravana para ver el nuevo idioma.'));
    }
  };

  const chooseLanguage = () => {
    Alert.alert(t('Idioma'), t('La app se reiniciará con el idioma elegido.'), [
      { text: `${t('Automático')} (${t('idioma del teléfono')})`, onPress: () => applyLanguage('auto') },
      { text: LANGUAGE_NAMES.es, onPress: () => applyLanguage('es') },
      { text: LANGUAGE_NAMES.en, onPress: () => applyLanguage('en') },
      { text: t('Cancelar'), style: 'cancel' },
    ]);
  };

  const profileSettings = settings.map((setting, index) =>
    index === 0 ? { ...setting, value: privacyLabel(privacy) } : setting,
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="scan-outline" size={40} onPress={() => router.push('/scan')} />
        <IconButton icon="share-social-outline" size={40} onPress={shareProfile} />
      </View>

      <View style={styles.identity}>
        <Avatar
          name={displayName}
          color={avatarColor}
          size={88}
          uri={profile?.avatarUrl ?? me.avatarUrl}
        />
        <AppText variant="h1" align="center" style={{ marginTop: spacing.md }}>
          {displayName}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 2 }}>
          @{username}
          {city ? ` · ${city}` : ''}
        </AppText>
        {bio ? (
          <AppText
            variant="body"
            color={colors.textSoft}
            align="center"
            style={{ marginTop: spacing.sm }}
          >
            {bio}
          </AppText>
        ) : null}
        <Button
          label={t('Editar perfil')}
          variant="secondary"
          size="sm"
          full={false}
          onPress={() => router.push('/profile/edit')}
          style={{ marginTop: spacing.lg, alignSelf: 'center' }}
        />
      </View>

      <View style={styles.stats}>
        <Stat value={String(stats.drives)} label={t('rutas')} align="center" />
        <Stat
          value={
            kmToDisplay(stats.km) >= 1000
              ? `${(kmToDisplay(stats.km) / 1000).toFixed(1)}k`
              : String(Math.round(kmToDisplay(stats.km)))
          }
          label={distanceUnit()}
          align="center"
        />
        <Stat value={`${stats.hours} h`} label={t('al volante')} align="center" />
        <Stat value={String(friendEntries.length)} label={t('amigos')} align="center" />
      </View>

      <SectionHeader
        title={t('Amigos')}
        action={friendEntries.length > 0 ? t('Ver todos') : undefined}
        onAction={() => router.push('/friends')}
      />
      {friendEntries.length === 0 ? (
        <Group>
          <Row
            icon="person-add-outline"
            label={t('Buscar amigos')}
            detail={t('Por @usuario o con tu QR')}
            onPress={() => router.push('/friends')}
          />
        </Group>
      ) : (
        <View style={styles.friendRow}>
          {friendEntries.slice(0, 5).map((friend) => (
            <Pressable
              key={friend.id}
              style={styles.friend}
              onPress={() => {
                if (!isDemo) router.push(`/u/${friend.profile.username}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('Ver perfil de {0}', friend.profile.displayName)}
            >
              <Avatar
                name={friend.profile.displayName}
                color={profileColor(friend.profile.username)}
                size={50}
                uri={friend.profile.avatarUrl ?? undefined}
              />
              <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                {friend.profile.displayName.split(' ')[0]}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/friends')}
            accessibilityRole="button"
            accessibilityLabel={t('Añadir amigos')}
            style={styles.friend}
          >
            <View style={styles.friendAdd}>
              <Ionicons name="add" size={22} color={colors.textSoft} />
            </View>
            <AppText variant="caption" color={colors.muted}>
              {t('Añadir')}
            </AppText>
          </Pressable>
        </View>
      )}

      {achievements.length > 0 ? (
        <>
          <SectionHeader title={t('Logros')} />
          <Group>
            {achievements.map((achievement, index) => (
              <Row
                key={achievement.id}
                icon={achievement.icon}
                label={achievement.title}
                detail={achievement.detail}
                divider={index > 0}
              />
            ))}
          </Group>
        </>
      ) : null}

      <SectionHeader title={t('Mi QR')} />
      <Group>
        <Row
          icon="qr-code-outline"
          label={showQr ? t('Ocultar mi QR') : t('Mostrar mi QR')}
          detail={t('Pégalo en el coche para que vean tu perfil')}
          onPress={() => setShowQr((value) => !value)}
          chevron={showQr ? 'chevron-up' : 'chevron-down'}
        />
        {showQr ? (
          <View style={styles.qrWrap}>
            <QRCard
              value={profileUrl(username)}
              label="PERFIL"
              caption={`@${username}`}
              size={168}
            />
          </View>
        ) : null}
      </Group>

      <SectionHeader title={t('Ajustes')} />
      <Group>
        <Row
          icon="navigate-outline"
          label={t('Tracking automático')}
          detail={t('Detecta y guarda tus rutas')}
          right={
            <Switch
              value={trackingEnabled}
              onValueChange={changeTracking}
              trackColor={{ false: colors.surfaceHigh, true: colors.green }}
              thumbColor={colors.white}
            />
          }
        />
        {SHARE_OUTSIDE_PARTY ? (
          <Row
            icon="people-outline"
            label={t('Mi ubicación para amigos')}
            detail={t('Tus amigos te ven en su mapa')}
            divider
            right={
              <Switch
                value={shareWithFriends === true}
                onValueChange={setShareWithFriends}
                trackColor={{ false: colors.surfaceHigh, true: colors.green }}
                thumbColor={colors.white}
              />
            }
          />
        ) : null}
        {profileSettings.map((setting, index) => (
          <Row
            key={setting.label}
            icon={setting.icon}
            label={setting.label}
            value={setting.value}
            divider
            onPress={() => {
              if (index === 0) {
                router.push('/profile/edit');
              } else if (setting.icon === 'document-text-outline') {
                router.push('/privacidad' as Href);
              } else if (setting.icon === 'help-circle-outline') {
                Alert.alert(
                  setting.label,
                  t('Envía tus rutas, aparcamientos y errores de hoy para revisar qué falló. Solo se envían si eliges dónde compartirlos.'),
                  [
                    { text: t('Cancelar'), style: 'cancel' },
                    {
                      text: t('Enviar diagnóstico'),
                      onPress: () => {
                        shareDiagnostic().catch((error) =>
                          Alert.alert(t('No pudimos preparar el diagnóstico'), String(error)),
                        );
                      },
                    },
                  ],
                );
              } else {
                Alert.alert(
                  setting.label,
                  t('Esta preferencia estará disponible en una próxima versión.'),
                );
              }
            }}
          />
        ))}
        <Row
          icon="language-outline"
          label={t('Idioma')}
          value={languageLabel(language)}
          divider
          onPress={chooseLanguage}
        />
        <Row
          icon="flask-outline"
          label={t('Simulador de pruebas')}
          detail={t('Rutas, aparcamiento y party sin conducir')}
          divider
          onPress={() => router.push('/simulador' as Href)}
        />
      </Group>

      <SectionHeader title={t('Cuenta')} />
      <Group>
        <Row
          icon={isDemo ? 'phone-portrait-outline' : 'cloud-done-outline'}
          label={isDemo ? t('Modo demo') : t('Cuenta conectada')}
          detail={
            isDemo
              ? t('Datos solo en este dispositivo. Crea una cuenta para guardarlos en la nube.')
              : (account?.email ?? t('Sesión local'))
          }
        />
        <Row
          icon="log-out-outline"
          label={busy ? 'Saliendo…' : isDemo ? t('Salir del modo demo') : t('Cerrar sesión')}
          divider
          onPress={busy ? undefined : confirmSignOut}
        />
        {!isDemo ? (
          <Row
            icon="trash-outline"
            label={t('Eliminar cuenta y datos')}
            tone="danger"
            divider
            onPress={() => router.push('/account/delete' as Href)}
          />
        ) : null}
      </Group>

      <AppText variant="caption" color={colors.dim} align="center" style={styles.footer}>
        {t('Caravana v0.1 · Tu ubicación solo se comparte dentro de una party.')}
      </AppText>
    </Screen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({
  icon,
  label,
  detail,
  value,
  right,
  divider,
  tone,
  chevron = 'chevron-forward',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  value?: string;
  right?: ReactNode;
  divider?: boolean;
  tone?: 'danger';
  chevron?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const color = tone === 'danger' ? colors.danger : colors.text;
  const content = (
    <>
      <Ionicons name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.textSoft} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={color}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 1 }}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" color={colors.muted}>
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name={chevron} size={16} color={colors.dim} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, divider && styles.rowDivider]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  identity: { alignItems: 'center', marginTop: spacing.sm },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  friendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  friend: { alignItems: 'center', gap: 6, width: 52 },
  friendAdd: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  qrWrap: { alignItems: 'center', paddingBottom: spacing.lg },
  footer: { marginTop: spacing['2xl'], marginBottom: spacing.xl },
});
