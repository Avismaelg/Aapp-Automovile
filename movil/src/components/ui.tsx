import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Platform,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '@/src/theme';
import { initials } from '@/src/lib/format';

type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono';

const iconLabels: Partial<Record<keyof typeof Ionicons.glyphMap, string>> = {
  add: 'Añadir',
  'arrow-back': 'Volver',
  'arrow-forward': 'Avanzar',
  'chevron-back': 'Volver',
  'chevron-down': 'Abrir opciones',
  'chevron-forward': 'Abrir',
  close: 'Cerrar',
  create: 'Editar',
  'create-outline': 'Editar',
  download: 'Descargar',
  'download-outline': 'Descargar',
  'log-out-outline': 'Cerrar sesión',
  refresh: 'Actualizar',
  'scan-outline': 'Escanear QR',
  'share-outline': 'Compartir',
  'share-social-outline': 'Compartir',
  'settings-outline': 'Ajustes',
  'trash-outline': 'Eliminar',
};

function labelForIcon(icon: keyof typeof Ionicons.glyphMap) {
  return iconLabels[icon] ?? icon.replace(/-outline$/, '').replace(/-/g, ' ');
}

export function AppText({
  children,
  variant = 'body',
  color = colors.text,
  style,
  numberOfLines,
  align,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: TextStyle['textAlign'];
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles[variant], { color, textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
  backgroundColor = colors.bg,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
}) {
  const content = (
    <View style={[styles.screenContent, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'elevated' | 'accent' | 'transparent';
}) {
  return (
    <View
      style={[
        styles.card,
        tone === 'elevated' && { backgroundColor: colors.surfaceAlt },
        tone === 'accent' && { backgroundColor: colors.accent, borderColor: colors.accent },
        tone === 'transparent' && {
          backgroundColor: 'transparent',
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  full = true,
  disabled,
  loading,
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime';
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const palette = {
    primary: { bg: colors.text, fg: colors.bg, border: colors.text },
    lime: { bg: colors.surfaceHigh, fg: colors.text, border: colors.surfaceHigh },
    secondary: {
      bg: colors.surfaceHigh,
      fg: colors.text,
      border: colors.surfaceHigh,
    },
    ghost: { bg: 'transparent', fg: colors.textSoft, border: colors.border },
    danger: { bg: 'rgba(255,77,94,0.12)', fg: colors.danger, border: 'rgba(255,77,94,0.12)' },
  }[variant];

  return (
    <Pressable
      disabled={disabled || loading || !onPress}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: Boolean(disabled || loading || !onPress),
        busy: Boolean(loading),
      }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        size === 'lg' && styles.buttonLg,
        full && { alignSelf: 'stretch' },
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled || !onPress ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === 'sm' ? 16 : 19}
              color={palette.fg}
            />
          ) : null}
          <AppText
            variant="bodyStrong"
            color={palette.fg}
            style={size === 'sm' ? { fontSize: 13 } : size === 'lg' ? { fontSize: 16 } : null}
          >
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 42,
  tone = 'surface',
  color = colors.text,
  badge,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  tone?: 'surface' | 'accent' | 'ghost';
  color?: string;
  badge?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const toneStyle = {
    surface: { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHigh },
    accent: { backgroundColor: colors.text, borderColor: colors.text },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  }[tone];

  const content = (
    <>
      <Ionicons name={icon} size={size * 0.46} color={tone === 'accent' ? colors.bg : color} />
      {badge ? <View style={styles.badge} /> : null}
    </>
  );

  const sharedStyle = [styles.iconButton, toneStyle, { width: size, height: size }];
  if (!onPress) return <View style={sharedStyle}>{content}</View>;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? labelForIcon(icon)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={Math.max(4, Math.ceil((48 - size) / 2))}
      style={({ pressed }) => [sharedStyle, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function Avatar({
  name,
  color,
  size = 44,
  uri,
  ring,
  online,
}: {
  name: string;
  color: string;
  size?: number;
  uri?: string;
  ring?: string;
  online?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderColor: ring ?? 'rgba(255,255,255,0.12)',
            borderWidth: ring ? 2 : 1,
          },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <AppText
            variant="bodyStrong"
            color="#0B0F14"
            style={{ fontSize: size * 0.34 }}
          >
            {initials(name)}
          </AppText>
        )}
      </View>
      {online ? (
        <View
          style={[
            styles.onlineDot,
            {
              width: size * 0.26,
              height: size * 0.26,
              borderRadius: size * 0.13,
              borderWidth: size * 0.05,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'lime' | 'danger' | 'dark';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    neutral: { bg: colors.surfaceHigh, fg: colors.textSoft, border: colors.surfaceHigh },
    accent: { bg: colors.accentSoft, fg: colors.accent, border: 'rgba(255,90,31,0.3)' },
    lime: { bg: colors.limeSoft, fg: colors.lime, border: 'rgba(201,255,77,0.28)' },
    danger: { bg: 'rgba(255,77,94,0.14)', fg: colors.danger, border: 'rgba(255,77,94,0.3)' },
    dark: { bg: 'rgba(0,0,0,0.55)', fg: colors.white, border: 'rgba(255,255,255,0.12)' },
  }[tone];

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <AppText variant="label" color={palette.fg} style={{ fontSize: 10 }}>
        {label}
      </AppText>
    </View>
  );
}

export function Stat({
  value,
  label,
  accent,
  align = 'left',
}: {
  value: string;
  label: string;
  accent?: string;
  align?: 'left' | 'center';
}) {
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <AppText variant="h2" color={accent ?? colors.text} style={{ fontSize: 24 }}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
        {label}
      </AppText>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="title">{title}</AppText>
      {action ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action}
        >
          <AppText variant="bodyStrong" color={colors.muted} style={{ fontSize: 13 }}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screenHeader, style]}>
      <View style={{ flex: 1 }}>
        <AppText variant="h1">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color={colors.muted} style={{ marginTop: 4 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.screenHeaderRight}>{right}</View> : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Input({
  label,
  rightSlot,
  style,
  inputStyle,
  error,
  ...props
}: TextInputProps & {
  label?: string;
  rightSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  error?: string;
}) {
  return (
    <View style={style}>
      {label ? (
        <AppText variant="label" color={colors.muted} style={{ marginBottom: 7 }}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
        <TextInput
          {...props}
          placeholderTextColor={colors.dim}
          selectionColor={colors.textSoft}
          accessibilityLabel={props.accessibilityLabel ?? label}
          style={[styles.input, inputStyle]}
        />
        {rightSlot}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.inputError}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.textSoft} />
      </View>
      <AppText variant="title" align="center">
        {title}
      </AppText>
      <AppText variant="caption" align="center" color={colors.muted}>
        {description}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  display: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1,
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  h3: {
    fontFamily: fonts.heading,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyStrong: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSm: {
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  buttonLg: {
    minHeight: 58,
  },
  iconButton: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.green,
    borderColor: colors.bg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  screenHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['3xl'],
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: spacing.md,
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapError: {
    borderColor: 'rgba(255,77,94,0.62)',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    paddingVertical: 12,
    // En web el navegador dibuja su propio recuadro de foco encima del campo.
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  inputError: {
    marginTop: 5,
    marginLeft: 2,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: spacing['3xl'],
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
