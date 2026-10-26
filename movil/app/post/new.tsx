import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
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
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useCreatePost, type FeedVisibility } from '@/src/hooks/useFeed';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';

const visibilityOptions: {
  key: FeedVisibility;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'public', label: 'Público', icon: 'globe-outline' },
  { key: 'friends', label: 'Amigos', icon: 'people-outline' },
  { key: 'private', label: 'Solo yo', icon: 'lock-closed-outline' },
];

export default function NewPostScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const account = useAuth((state) => state.account);
  const createPost = useCreatePost();
  const isDemo = account?.mode === 'demo';
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<FeedVisibility>('friends');
  const [image, setImage] = useState<{ uri: string; mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const pickImage = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permiso de fotos',
          'Caravana necesita acceso a tus fotos para adjuntar una imagen al post.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setImage({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    } catch {
      setError('No pudimos abrir la galería.');
    }
  };

  const publish = async () => {
    setError(null);
    if (caption.trim().length === 0 && !image) {
      setError('Escribe algo o añade una foto antes de publicar.');
      return;
    }

    try {
      await createPost.mutateAsync({
        caption,
        visibility,
        image: image ?? undefined,
      });
      goBack();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'No pudimos publicar. Inténtalo de nuevo.',
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
            <AppText variant="label" color={colors.accent}>NUEVA PUBLICACIÓN</AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">Comparte la carretera.</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              Una ruta, una foto, una quedada o una idea. Tu caravana lo verá en el feed.
            </AppText>
          </View>

          {isDemo ? (
            <AuthNotice
              tone="info"
              message="Estás en modo demo: publicar requiere una cuenta real."
            />
          ) : null}

          <Card style={styles.authorCard}>
            <Avatar name={me.name} color={me.color} size={46} uri={me.avatarUrl} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{me.name}</AppText>
              <AppText variant="caption" color={colors.muted}>@{me.username}</AppText>
            </View>
            <Pill
              label={image ? 'Foto' : 'Texto'}
              tone="neutral"
              icon={image ? 'image-outline' : 'text-outline'}
            />
          </Card>

          <Input
            value={caption}
            onChangeText={(value) => {
              setCaption(value.slice(0, 500));
              setError(null);
            }}
            placeholder="¿Qué está pasando en la carretera?"
            multiline
            maxLength={500}
            inputStyle={styles.captionInput}
            style={{ marginTop: spacing.lg }}
          />
          <AppText
            variant="caption"
            color={caption.length > 460 ? colors.accent : colors.dim}
            align="right"
          >
            {caption.length}/500
          </AppText>

          {image ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="cover" />
              <Pressable
                style={styles.removeImage}
                onPress={() => setImage(null)}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color="#120802" />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.addPhoto} onPress={() => void pickImage()}>
              <View style={styles.addPhotoIcon}>
                <Ionicons name="image-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Añadir una foto</AppText>
                <AppText variant="caption" color={colors.muted}>
                  JPG, PNG o WebP · máximo 5 MB
                </AppText>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={colors.muted} />
            </Pressable>
          )}

          <AppText variant="label" color={colors.muted} style={{ marginTop: spacing.lg }}>
            ¿Quién puede verlo?
          </AppText>
          <View style={styles.visibilityRow}>
            {visibilityOptions.map((option) => {
              const selected = option.key === visibility;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setVisibility(option.key)}
                  style={[
                    styles.visibilityOption,
                    selected && styles.visibilityOptionActive,
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={selected ? colors.lime : colors.muted}
                  />
                  <AppText
                    variant="caption"
                    color={selected ? colors.text : colors.muted}
                  >
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {error ? <AuthNotice message={error} /> : null}

          <Button
            label={createPost.isPending ? 'Publicando…' : 'Publicar'}
            icon="send-outline"
            size="lg"
            loading={createPost.isPending}
            disabled={isDemo || (!caption.trim() && !image)}
            onPress={publish}
            style={{ marginTop: spacing.xl }}
          />

          <View style={styles.footer}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.dim} />
            <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
              No compartas direcciones exactas, placas ni datos personales en una
              publicación pública.
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
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  captionInput: {
    minHeight: 150,
    textAlignVertical: 'top',
  },
  imagePreview: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 210,
  },
  removeImage: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  addPhotoIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  visibilityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visibilityOptionActive: {
    borderColor: 'rgba(201,255,77,0.35)',
    backgroundColor: colors.limeSoft,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
});
