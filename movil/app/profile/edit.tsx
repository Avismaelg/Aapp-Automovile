import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
  Pill,
} from '@/src/components/ui';
import { useMyProfile, useUpdateProfile } from '@/src/hooks/useProfile';
import {
  privacyLabel,
  profileColor,
  type ProfilePrivacy,
  type UserProfile,
} from '@/src/lib/profile-db';
import { colors, radius, spacing } from '@/src/theme';

const privacyOptions: {
  key: ProfilePrivacy;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  detail: string;
}[] = [
  {
    key: 'public',
    label: 'Público',
    icon: 'globe-outline',
    detail: 'Cualquiera con tu QR o @usuario puede ver tu perfil.',
  },
  {
    key: 'friends',
    label: 'Amigos',
    icon: 'people-outline',
    detail: 'Solo tus amigos aceptados ven los detalles.',
  },
  {
    key: 'private',
    label: 'Privado',
    icon: 'lock-closed-outline',
    detail: 'El QR muestra solo una tarjeta mínima.',
  },
];

export default function EditProfileScreen() {
  const { profile, isLoading, isError, refetch, isDemo } = useMyProfile();

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
          Cargando tu perfil…
        </AppText>
      </SafeAreaView>
    );
  }

  if (isError || (!profile && !isLoading)) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <Ionicons name="cloud-offline-outline" size={36} color={colors.dim} />
        <AppText variant="h2" align="center" style={{ marginTop: spacing.md }}>
          No pudimos cargar tu perfil
        </AppText>
        <Button
          label="Reintentar"
          variant="secondary"
          onPress={() => refetch()}
          style={{ marginTop: spacing.xl }}
        />
      </SafeAreaView>
    );
  }

  if (!profile) return null;
  return <EditProfileForm profile={profile} isDemo={isDemo} />;
}

function EditProfileForm({ profile, isDemo }: { profile: UserProfile; isDemo: boolean }) {
  const router = useRouter();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [city, setCity] = useState(profile.city);
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(profile.privacy);
  const [formError, setFormError] = useState<string | null>(null);
  const username = profile.username;
  const avatarColor = profileColor(username);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const save = async () => {
    setFormError(null);
    if (displayName.trim().length < 2) {
      setFormError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (bio.length > 280) {
      setFormError('La bio admite un máximo de 280 caracteres.');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        displayName,
        bio,
        city,
        privacy,
      });
      goBack();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar el perfil. Inténtalo de nuevo.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.header}>
            <IconButton icon="close" size={40} onPress={goBack} />
            <AppText variant="label" color={colors.accent}>EDITAR PERFIL</AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">Tu identidad en la carretera.</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              Este perfil aparece cuando alguien escanea tu QR o abre tu @usuario.
            </AppText>
          </View>

          <Card style={styles.avatarCard}>
            <Avatar
              name={displayName || profile.displayName}
              color={avatarColor}
              size={72}
              uri={profile.avatarUrl ?? undefined}
              ring={colors.border}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{displayName || profile.displayName}</AppText>
              <AppText variant="caption" color={colors.accent}>@{username}</AppText>
              <AppText variant="caption" color={colors.muted} style={{ marginTop: 4 }}>
                La subida de foto de perfil llegará en la siguiente fase.
              </AppText>
            </View>
            <Pill label={isDemo ? 'Demo' : 'Cuenta'} tone={isDemo ? 'neutral' : 'lime'} />
          </Card>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>Datos públicos</AppText>
            <Input
              label="Nombre visible"
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                setFormError(null);
              }}
              placeholder="Tu nombre o apodo"
              maxLength={60}
              autoCapitalize="words"
            />
            <Input
              label="Usuario"
              value={`@${username}`}
              editable={false}
              rightSlot={<Ionicons name="lock-closed-outline" size={15} color={colors.dim} />}
            />
            <Input
              label="Ciudad"
              value={city}
              onChangeText={setCity}
              placeholder="Santo Domingo, RD"
              maxLength={80}
              autoCapitalize="words"
            />
            <Input
              label="Bio"
              value={bio}
              onChangeText={(value) => {
                setBio(value.slice(0, 280));
                setFormError(null);
              }}
              placeholder="Cuéntanos qué te mueve"
              multiline
              maxLength={280}
              inputStyle={styles.bioInput}
            />
            <AppText
              variant="caption"
              color={bio.length > 260 ? colors.accent : colors.dim}
              align="right"
            >
              {bio.length}/280
            </AppText>
          </View>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>Privacidad del perfil</AppText>
            <View style={styles.privacyGrid}>
              {privacyOptions.map((option) => {
                const selected = privacy === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setPrivacy(option.key)}
                    style={[
                      styles.privacyOption,
                      selected && styles.privacyOptionActive,
                    ]}
                  >
                    <View style={[styles.privacyIcon, selected && styles.privacyIconActive]}>
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={selected ? '#120802' : colors.muted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" color={selected ? colors.text : colors.textSoft}>
                        {option.label}
                      </AppText>
                      <AppText variant="caption" color={colors.muted} numberOfLines={2}>
                        {option.detail}
                      </AppText>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={17} color={colors.lime} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.privacyNote}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.lime} />
              <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                Ahora mismo: <AppText variant="bodyStrong" color={colors.textSoft}>{privacyLabel(privacy)}</AppText>.
                La ubicación en vivo nunca se muestra en el perfil público.
              </AppText>
            </View>
          </View>

          {formError ? <AuthNotice message={formError} /> : null}
          {updateProfile.isError && !formError ? (
            <AuthNotice message="No pudimos guardar los cambios." />
          ) : null}

          <Button
            label={updateProfile.isPending ? 'Guardando…' : 'Guardar cambios'}
            icon="checkmark-circle-outline"
            size="lg"
            loading={updateProfile.isPending}
            onPress={save}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            label="Ver mi perfil público"
            icon="person-circle-outline"
            variant="ghost"
            onPress={() => router.push(`/u/${username}`)}
            style={{ marginTop: 8 }}
          />
          <View style={styles.footer}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.dim} />
            <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
              Tu correo, teléfono y ubicación no se publican. El QR solo contiene tu
              @usuario o el slug de tu vehículo.
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  state: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  heading: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  bioInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  privacyGrid: {
    gap: 8,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  privacyOptionActive: {
    borderColor: 'rgba(201,255,77,0.35)',
    backgroundColor: 'rgba(201,255,77,0.06)',
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIconActive: {
    backgroundColor: colors.lime,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
});
