import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { AuthNotice } from '@/src/components/auth';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
  Pill,
  Screen,
  SectionHeader,
} from '@/src/components/ui';
import {
  useFriends,
  useRemoveFriend,
  useRespondFriendRequest,
  useSearchProfiles,
  useSendFriendRequest,
} from '@/src/hooks/useFriends';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useActiveParty } from '@/src/hooks/useParty';
import { useInviteToParty } from '@/src/hooks/usePartyInvites';
import { relationForTarget, type FriendEntry } from '@/src/lib/friends';
import { profileColor, type UserProfile } from '@/src/lib/profile-db';
import { colors, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

export default function FriendsScreen() {
  const router = useRouter();
  const {
    entries,
    friends,
    incoming,
    outgoing,
    isLoading,
    isError,
    refetch,
    isDemo,
  } = useFriends();
  const [search, setSearch] = useState('');
  const { profiles: searchResults, isLoading: searching } = useSearchProfiles(search);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const [actionError, setActionError] = useState<string | null>(null);
  const me = useCurrentUser();
  const { party } = useActiveParty();
  const inviteToParty = useInviteToParty();
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t('No pudimos completar la acción.'),
      );
    }
  };

  const confirmRemove = (entry: FriendEntry) => {
    const perform = () =>
      run(() => removeFriend.mutateAsync(entry.id));

    if (Platform.OS === 'web') {
      void perform();
      return;
    }

    Alert.alert(
      entry.status === 'accepted' ? t('Eliminar amigo') : t('Cancelar solicitud'),
      t('¿Quieres quitar a {0}?', entry.profile.displayName),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Quitar'), style: 'destructive', onPress: () => void perform() },
      ],
    );
  };

  // Invitar a tu party con un toque (si no tienes, se crea).
  const inviteFriend = (profile: UserProfile) =>
    run(async () => {
      setInvitingId(profile.id);
      try {
        await inviteToParty.mutateAsync({
          partyId: party?.id ?? null,
          userIds: [profile.id],
          myName: me.name,
        });
        setInvitedIds((list) => [...list, profile.id]);
      } finally {
        setInvitingId(null);
      }
    });

  const relationFor = (profileId: string) => relationForTarget(entries, profileId);

  const renderSearchAction = (profile: UserProfile) => {
    const relation = relationFor(profile.id);
    if (relation === 'friends') return <Pill label={t('Amigos')} tone="lime" icon="checkmark" />;
    if (relation === 'outgoing') return <Pill label={t('Enviada')} tone="neutral" icon="time-outline" />;
    if (relation === 'incoming') {
      const entry = entries.find((item) => item.profile.id === profile.id);
      return (
        <Button
          label={t('Aceptar')}
          size="sm"
          full={false}
          onPress={() =>
            entry
              ? run(() => respondRequest.mutateAsync({ id: entry.id, accept: true }))
              : undefined
          }
          style={{ paddingHorizontal: 12 }}
        />
      );
    }

    return (
      <Button
        label={t('Añadir')}
        size="sm"
        full={false}
        icon="person-add-outline"
        loading={sendRequest.isPending}
        onPress={() => run(() => sendRequest.mutateAsync(profile.id))}
        style={{ paddingHorizontal: 12 }}
      />
    );
  };

  const renderPerson = (profile: UserProfile, entry?: FriendEntry) => (
    <View key={profile.id} style={styles.personRow}>
      <Avatar
        name={profile.displayName}
        color={profileColor(profile.username)}
        size={44}
        uri={profile.avatarUrl ?? undefined}
      />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{profile.displayName}</AppText>
        <AppText variant="caption" color={colors.accent}>@{profile.username}</AppText>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {profile.city || t('Caravana')}
        </AppText>
      </View>
      {entry?.status === 'accepted' && !isDemo ? (
        <Button
          label={invitedIds.includes(profile.id) ? t('Invitado') : t('Party')}
          size="sm"
          full={false}
          variant={invitedIds.includes(profile.id) ? 'ghost' : 'primary'}
          icon={invitedIds.includes(profile.id) ? 'checkmark' : 'radio-outline'}
          loading={inviteToParty.isPending && invitingId === profile.id}
          onPress={
            invitedIds.includes(profile.id) ? undefined : () => void inviteFriend(profile)
          }
          style={{ paddingHorizontal: 12 }}
        />
      ) : null}
      {entry ? (
        <IconButton
          icon="person-remove-outline"
          size={34}
          tone="ghost"
          onPress={() => confirmRemove(entry)}
        />
      ) : null}
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={goBack} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>{t('COMUNIDAD')}</AppText>
          <AppText variant="h1">{t('Amigos')}</AppText>
        </View>
        <Pill
          label={isDemo ? t('Demo') : `${friends.length} amigos`}
          tone={isDemo ? 'neutral' : 'lime'}
          icon="people-outline"
        />
      </View>

      <Input
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setActionError(null);
        }}
        placeholder={t('Buscar por nombre o @usuario')}
        autoCapitalize="none"
        autoCorrect={false}
        rightSlot={
          searching ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="search-outline" size={18} color={colors.muted} />
          )
        }
        style={{ marginTop: spacing.lg }}
      />

      {isDemo ? (
        <AuthNotice
          tone="info"
          message={t('Estás en modo demo: la lista muestra amigos de ejemplo. Las solicitudes reales se activan con una cuenta.')}
        />
      ) : null}

      {actionError ? <AuthNotice message={actionError} /> : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>{t('Cargando amistades…')}</AppText>
        </View>
      ) : null}

      {isError ? (
        <Card style={styles.errorCard}>
          <AppText variant="bodyStrong">{t('No pudimos cargar tus amigos')}</AppText>
          <Button label={t('Reintentar')} variant="secondary" onPress={() => refetch()} />
        </Card>
      ) : null}

      {search.trim().length >= 2 ? (
        <>
          <SectionHeader title={t('Resultados')} action={`${searchResults.length}`} />
          {searchResults.length === 0 && !searching ? (
            <Card>
              <AppText variant="bodyStrong">{t('Sin resultados')}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {t('Prueba con otro nombre o @usuario.')}
              </AppText>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {searchResults.map((profile) => (
                <View key={profile.id} style={styles.searchRow}>
                  <Avatar
                    name={profile.displayName}
                    color={profileColor(profile.username)}
                    size={42}
                    uri={profile.avatarUrl ?? undefined}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{profile.displayName}</AppText>
                    <AppText variant="caption" color={colors.accent}>@{profile.username}</AppText>
                  </View>
                  {renderSearchAction(profile)}
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}

      {incoming.length > 0 ? (
        <>
          <SectionHeader title={t('Solicitudes recibidas')} action={`${incoming.length}`} />
          <Card style={styles.listCard}>
            {incoming.map((entry) => (
              <View key={entry.id} style={styles.requestRow}>
                <Avatar
                  name={entry.profile.displayName}
                  color={profileColor(entry.profile.username)}
                  size={44}
                  uri={entry.profile.avatarUrl ?? undefined}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {entry.profile.displayName}
                  </AppText>
                  <AppText variant="caption" color={colors.accent}>@{entry.profile.username}</AppText>
                </View>
                <Button
                  label={t('Aceptar')}
                  size="sm"
                  full={false}
                  loading={respondRequest.isPending}
                  onPress={() => run(() => respondRequest.mutateAsync({ id: entry.id, accept: true }))}
                  style={{ paddingHorizontal: 11 }}
                />
                <IconButton
                  icon="close"
                  size={32}
                  tone="ghost"
                  onPress={() => run(() => respondRequest.mutateAsync({ id: entry.id, accept: false }))}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {outgoing.length > 0 ? (
        <>
          <SectionHeader title={t('Solicitudes enviadas')} action={`${outgoing.length}`} />
          <AppText variant="caption" color={colors.muted} style={{ marginBottom: spacing.sm }}>
            {t('Aparecerán en tu mapa y podrás invitarlos a tu party cuando acepten.')}
          </AppText>
          <Card style={styles.listCard}>
            {outgoing.map((entry) => (
              <View key={entry.id} style={styles.personRow}>
                <Avatar
                  name={entry.profile.displayName}
                  color={profileColor(entry.profile.username)}
                  size={42}
                  uri={entry.profile.avatarUrl ?? undefined}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {entry.profile.displayName}
                  </AppText>
                  <AppText variant="caption" color={colors.accent}>@{entry.profile.username}</AppText>
                </View>
                <Pill label={t('Pendiente')} tone="neutral" icon="time-outline" />
                <IconButton
                  icon="close"
                  size={32}
                  tone="ghost"
                  onPress={() => confirmRemove(entry)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={t('Mis amigos')} action={`${friends.length}`} />
      {friends.length === 0 && !isLoading ? (
        <Card style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={24} color={colors.accent} />
          </View>
          <AppText variant="title" align="center">{t('Tu caravana empieza aquí')}</AppText>
          <AppText variant="caption" color={colors.muted} align="center">
            {t('Busca a alguien por su @usuario o comparte tu QR de perfil.')}
          </AppText>
          <Button
            label={t('Compartir mi QR')}
            variant="secondary"
            icon="qr-code-outline"
            onPress={() => router.push('/(tabs)/profile')}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {friends.map((entry) => renderPerson(entry.profile, entry))}
        </Card>
      )}

      <View style={styles.footer}>
        <Ionicons name="lock-closed-outline" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
          {t('Las solicitudes solo son visibles para las dos personas implicadas.')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  loading: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.xl,
  },
  errorCard: { gap: spacing.md, marginTop: spacing.lg },
  listCard: {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.xl,
  },
});
