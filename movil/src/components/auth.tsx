import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, IconButton } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/theme';

export function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandMark, compact && styles.brandMarkSmall]}>
        <Ionicons
          name="car-sport"
          size={compact ? 16 : 19}
          color="#120802"
        />
      </View>
      <View>
        <AppText
          variant="label"
          color={colors.text}
          style={{ letterSpacing: 2.4, fontSize: compact ? 10 : 12 }}
        >
          CARAVANA
        </AppText>
        {!compact ? (
          <AppText variant="caption" color={colors.muted} style={{ fontSize: 10 }}>
            La red social del coche
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function AuthNotice({
  message,
  tone = 'danger',
}: {
  message: string;
  tone?: 'danger' | 'info' | 'lime';
}) {
  const palette = {
    danger: {
      icon: 'alert-circle-outline' as const,
      color: colors.danger,
      background: 'rgba(255,77,94,0.1)',
      border: 'rgba(255,77,94,0.26)',
    },
    info: {
      icon: 'information-circle-outline' as const,
      color: colors.cyan,
      background: 'rgba(77,225,255,0.08)',
      border: 'rgba(77,225,255,0.2)',
    },
    lime: {
      icon: 'checkmark-circle-outline' as const,
      color: colors.lime,
      background: colors.limeSoft,
      border: 'rgba(201,255,77,0.22)',
    },
  }[tone];

  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <Ionicons name={palette.icon} size={17} color={palette.color} />
      <AppText variant="caption" color={colors.textSoft} style={styles.noticeText}>
        {message}
      </AppText>
    </View>
  );
}

export function AuthFormLayout({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
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
          <LinearGradient
            colors={['rgba(255,90,31,0.18)', 'rgba(6,8,11,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.glow}
            pointerEvents="none"
          />

          <View style={styles.formHeader}>
            <IconButton icon="arrow-back" size={40} onPress={onBack} />
            <AuthBrand compact />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">{title}</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 7 }}>
              {subtitle}
            </AppText>
          </View>

          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 300,
    borderBottomLeftRadius: 180,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkSmall: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  heading: {
    marginTop: spacing['3xl'],
    marginBottom: spacing['2xl'],
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeText: {
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing['2xl'],
  },
});
