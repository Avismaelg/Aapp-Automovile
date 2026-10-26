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
import { AppText, Avatar, Button, Card, IconButton, Input } from '@/src/components/ui';
import { useActiveParty, usePartyMessages, useSendPartyMessage } from '@/src/hooks/useParty';
import { timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { colors, radius, spacing } from '@/src/theme';

export default function PartyChatScreen() {
  const router = useRouter();
  const { party, isDemo, isLoading: partyLoading } = useActiveParty();
  const { messages, isLoading, isError, refetch } = usePartyMessages(party?.id);
  const sendMessage = useSendPartyMessage();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/party');
  };

  const send = async () => {
    if (!party || !body.trim()) return;
    setError(null);
    try {
      await sendMessage.mutateAsync({ partyId: party.id, body });
      setBody('');
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : 'No pudimos enviar el mensaje.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <IconButton icon="chevron-down" size={40} onPress={goBack} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.accent}>PARTY · CHAT</AppText>
            <AppText variant="title" numberOfLines={1}>
              {isDemo ? 'Caravana de domingo' : party?.name ?? 'Chat'}
            </AppText>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
              EN VIVO
            </AppText>
          </View>
        </View>

        {isDemo ? (
          <AuthNotice
            tone="info"
            message="Estás en modo demo: el chat real se activa con una cuenta. El PTT de voz llegará con LiveKit."
          />
        ) : null}

        {error ? <AuthNotice message={error} /> : null}

        {partyLoading || isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.accent} />
            <AppText variant="caption" color={colors.muted}>Cargando mensajes…</AppText>
          </View>
        ) : isError ? (
          <Card style={styles.stateCard}>
            <AppText variant="bodyStrong">No pudimos cargar el chat</AppText>
            <Button label="Reintentar" variant="secondary" onPress={() => void refetch()} />
          </Card>
        ) : !party && !isDemo ? (
          <Card style={styles.stateCard}>
            <Ionicons name="chatbubble-outline" size={28} color={colors.dim} />
            <AppText variant="title" align="center">No hay party activa</AppText>
            <AppText variant="caption" color={colors.muted} align="center">
              Crea o únete a una party para abrir el chat de la caravana.
            </AppText>
            <Button label="Volver a Party" variant="secondary" onPress={goBack} />
          </Card>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles-outline" size={24} color={colors.accent} />
                </View>
                <AppText variant="title" align="center">El chat está libre</AppText>
                <AppText variant="caption" color={colors.muted} align="center">
                  Escribe el primer mensaje para coordinar la caravana.
                </AppText>
              </View>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  style={[styles.messageRow, message.isMe && styles.messageRowMe]}
                >
                  {!message.isMe ? (
                    <Avatar
                      name={message.profile.displayName}
                      color={profileColor(message.profile.username)}
                      size={30}
                    />
                  ) : null}
                  <View style={{ maxWidth: '82%' }}>
                    {!message.isMe ? (
                      <AppText variant="caption" color={colors.muted} style={{ marginBottom: 3 }}>
                        {message.profile.displayName.split(' ')[0]}
                      </AppText>
                    ) : null}
                    <View style={[styles.bubble, message.isMe ? styles.bubbleMe : styles.bubbleOther]}>
                      <AppText variant="body" color={message.isMe ? colors.text : colors.textSoft}>
                        {message.body}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={message.isMe ? 'rgba(255,255,255,0.55)' : colors.dim}
                        style={{ fontSize: 9, marginTop: 3 }}
                      >
                        {timeAgo(message.createdAt)}
                      </AppText>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <Input
            value={body}
            onChangeText={(value) => {
              setBody(value.slice(0, 500));
              setError(null);
            }}
            placeholder={isDemo ? 'El chat real requiere cuenta' : 'Mensaje para la caravana…'}
            multiline
            maxLength={500}
            editable={!isDemo && Boolean(party)}
            style={styles.composerInput}
            rightSlot={
              <Pressable
                onPress={() => void send()}
                disabled={isDemo || !party || !body.trim() || sendMessage.isPending}
                hitSlop={8}
                style={[
                  styles.sendButton,
                  (isDemo || !party || !body.trim()) && styles.sendButtonDisabled,
                ]}
              >
                {sendMessage.isPending ? (
                  <ActivityIndicator size="small" color="#120802" />
                ) : (
                  <Ionicons name="send" size={16} color="#120802" />
                )}
              </Pressable>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.limeSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lime },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateCard: {
    gap: spacing.sm,
    alignItems: 'center',
    margin: spacing.lg,
  },
  messages: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMe: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.35)',
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  composerInput: { marginBottom: 0 },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.35 },
});
