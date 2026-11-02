import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QRCard } from '@/src/components/QRCard';
import { AppText, Avatar } from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import { useInviteToParty, useSentPartyInvites } from '@/src/hooks/usePartyInvites';
import { errorMessage } from '@/src/lib/alerts';
import { inviteMessage, sortInviteCandidates } from '@/src/lib/party-invites';
import { profileColor } from '@/src/lib/profile-db';
import { partyUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// Todas las formas de añadir gente al convoy en un solo sitio:
// amigos con un toque, código para dictar, QR para escanear y enlace para
// WhatsApp. Sin party, invitar a un amigo la crea.
export function InviteSheet({
  visible,
  onClose,
  party,
  simulated = false,
  extraFriends = [],
}: {
  visible: boolean;
  onClose: () => void;
  party: { id: string; code: string; name: string; memberIds: string[] } | null;
  // Simulador: las invitaciones no se envían al servidor.
  simulated?: boolean;
  extraFriends?: { id: string; name: string; username: string }[];
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useCurrentUser();
  const { friends, isDemo } = useFriends();
  const sent = useSentPartyInvites(party?.id);
  const invite = useInviteToParty();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Optimista: el botón cambia al instante, aunque el servidor tarde.
  const [justInvited, setJustInvited] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const candidates = sortInviteCandidates(
    [
      ...friends.map((friend) => ({
        id: friend.profile.id,
        name: friend.profile.displayName,
        username: friend.profile.username,
        avatarUrl: friend.profile.avatarUrl as string | null,
      })),
      ...extraFriends.map((friend) => ({ ...friend, avatarUrl: null })),
    ],
    party?.memberIds ?? [],
    [...sent, ...justInvited.map((inviteeId) => ({ inviteeId, status: 'pending' as const }))],
  );

  const inviteFriend = async (friendId: string) => {
    setError(null);
    setPendingId(friendId);
    try {
      if (simulated) await new Promise((resolve) => setTimeout(resolve, 400));
      else await invite.mutateAsync({ partyId: party?.id ?? null, userIds: [friendId], myName: me.name });
      setJustInvited((list) => [...list, friendId]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (inviteError) {
      setError(errorMessage(inviteError, t('No pudimos invitar.')));
    } finally {
      setPendingId(null);
    }
  };

  const copyCode = async () => {
    if (!party) return;
    await Clipboard.setStringAsync(party.code);
    setCopied(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => setCopied(false), 1800);
  };

  const shareLink = () => {
    if (!party) return;
    void Share.share({ message: inviteMessage(party.name, party.code) });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Cerrar')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <AppText variant="h2" style={{ flex: 1 }}>{t('Añadir al convoy')}</AppText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Cerrar')}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.lg }}>
          <View>
            <AppText variant="label" color={colors.muted} style={styles.sectionLabel}>
              {t('TUS AMIGOS · UN TOQUE PARA INVITAR')}
            </AppText>
            {isDemo && !simulated ? (
              <AppText variant="caption" color={colors.muted}>
                {t('Las invitaciones reales requieren una cuenta conectada.')}
              </AppText>
            ) : candidates.length === 0 ? (
              <Pressable
                style={styles.emptyFriends}
                onPress={() => {
                  onClose();
                  router.push('/friends');
                }}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.text} />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('Añadir amigos')}</AppText>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            ) : (
              candidates.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={({ pressed }) => [styles.friendRow, pressed && { opacity: 0.7 }]}
                  disabled={friend.state !== 'invite' || pendingId != null}
                  onPress={() => void inviteFriend(friend.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('Invitar a {0}', friend.name)}
                >
                  <Avatar
                    name={friend.name}
                    color={profileColor(friend.username)}
                    size={40}
                    uri={friend.avatarUrl ?? undefined}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{friend.name}</AppText>
                    <AppText variant="caption" color={colors.muted}>@{friend.username}</AppText>
                  </View>
                  <InviteButton state={friend.state} loading={pendingId === friend.id} />
                </Pressable>
              ))
            )}
            {error ? (
              <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.sm }}>
                {error}
              </AppText>
            ) : null}
          </View>

          {party ? (
            <View>
              <AppText variant="label" color={colors.muted} style={styles.sectionLabel}>
                {t('CUALQUIERA CON LA APP')}
              </AppText>
              <Pressable style={styles.codeBox} onPress={() => void copyCode()} accessibilityRole="button" accessibilityLabel={t('Copiar código')}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" color={colors.muted}>{t('Código de la party')}</AppText>
                  <AppText style={styles.code}>{party.code}</AppText>
                </View>
                <View style={styles.copyPill}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={colors.text} />
                  <AppText variant="caption">{copied ? t('Copiado') : t('Copiar')}</AppText>
                </View>
              </Pressable>

              <Pressable style={styles.whatsapp} onPress={shareLink} accessibilityRole="button">
                <Ionicons name="logo-whatsapp" size={20} color={colors.bg} />
                <AppText variant="bodyStrong" color={colors.bg}>{t('Enviar invitación')}</AppText>
              </Pressable>

              <View style={styles.qr}>
                <QRCard
                  value={partyUrl(party.code)}
                  label="PARTY"
                  caption={t('Escanéalo desde Party › Escanear')}
                  size={150}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InviteButton({ state, loading }: { state: 'member' | 'invited' | 'invite'; loading: boolean }) {
  if (state === 'member') {
    return <AppText variant="caption" color={colors.muted}>{t('En la party')}</AppText>;
  }
  if (state === 'invited') {
    return (
      <View style={[styles.invitePill, styles.invitedPill]}>
        <Ionicons name="checkmark" size={14} color={colors.textSoft} />
        <AppText variant="caption" color={colors.textSoft}>{t('Invitado')}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.invitePill}>
      <Ionicons name={loading ? 'hourglass-outline' : 'add'} size={15} color={colors.bg} />
      <AppText variant="caption" color={colors.bg} style={{ fontWeight: '700' }}>{t('Invitar')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  sectionLabel: { marginBottom: spacing.sm },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  emptyFriends: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  invitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  invitedPill: { backgroundColor: colors.surfaceHigh },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 6, color: colors.text, marginTop: 2 },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  whatsapp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  qr: { alignItems: 'center', marginTop: spacing.lg },
});
