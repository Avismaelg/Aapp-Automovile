import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AuthBrand, AuthNotice } from '@/src/components/auth';
import { AppText, Avatar, Button, Pill } from '@/src/components/ui';
import { currentUser, friends } from '@/src/data/mock';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';

const features = [
  {
    icon: 'radio' as const,
    color: colors.accent,
    title: 'Party en vivo',
    detail: 'Mapa compartido, chat y walkie-talkie.',
  },
  {
    icon: 'flag' as const,
    color: colors.lime,
    title: 'Retos A → B',
    detail: 'Coche, moto, EV o camión. Gana quien llega.',
  },
  {
    icon: 'qr-code' as const,
    color: colors.cyan,
    title: 'Tu identidad en QR',
    detail: 'Perfil y garaje público al escanear.',
  },
];

function RouteArt() {
  return (
    <Svg width="100%" height={118} viewBox="0 0 340 118" preserveAspectRatio="none">
      <Path
        d="M0 98 C 52 88, 62 44, 118 52 S 202 92, 252 62 S 306 18, 340 24"
        stroke="#1C2631"
        strokeWidth={18}
        fill="none"
      />
      <Path
        d="M8 100 C 58 90, 66 48, 120 56 S 204 94, 254 64 S 308 22, 334 26"
        stroke={colors.accent}
        strokeWidth={2}
        strokeDasharray="6 7"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={8} cy={100} r={7} fill={colors.lime} />
      <Circle cx={334} cy={26} r={7} fill={colors.accent} />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const continueAsDemo = useAuth((state) => state.continueAsDemo);
  const [enteringDemo, setEnteringDemo] = useState(false);

  const enterDemo = async () => {
    if (enteringDemo) return;
    setEnteringDemo(true);
    await continueAsDemo();
    setEnteringDemo(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <LinearGradient
          colors={['#2A160F', '#0C1117', colors.bg]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.background}
          pointerEvents="none"
        />
        <View style={styles.orb} pointerEvents="none" />

        <View style={styles.topRow}>
          <AuthBrand />
          <Pill label="MVP" tone="neutral" />
        </View>

        <View style={styles.hero}>
          <Pill label="Hecho para la carretera" tone="accent" icon="navigate" />
          <AppText variant="display" style={styles.title}>
            La carretera se vive{' '}
            <AppText variant="display" color={colors.accent}>
              en caravana.
            </AppText>
          </AppText>
          <AppText variant="body" color={colors.textSoft} style={styles.subtitle}>
            Organiza parties, reta a tus amigos y guarda cada ruta, repostaje y
            recuerdo de tu coche. Todo en un solo lugar.
          </AppText>
        </View>

        <View style={styles.routeCard}>
          <View style={styles.routeTop}>
            <View>
              <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
                SALIDA
              </AppText>
              <AppText variant="bodyStrong" style={{ marginTop: 2 }}>
                Zona Colonial
              </AppText>
            </View>
            <Pill label="En vivo" tone="lime" icon="radio" />
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="label" color={colors.accent} style={{ fontSize: 9 }}>
                META
              </AppText>
              <AppText variant="bodyStrong" style={{ marginTop: 2 }}>
                Punta Cana
              </AppText>
            </View>
          </View>

          <RouteArt />

          <View style={styles.crewRow}>
            <View style={styles.avatars}>
              {[currentUser, ...friends.slice(0, 2)].map((person, index) => (
                <View
                  key={person.id}
                  style={[styles.avatarItem, index > 0 && { marginLeft: -9 }]}
                >
                  <Avatar
                    name={person.name}
                    color={person.color}
                    size={30}
                    ring={colors.surface}
                  />
                </View>
              ))}
            </View>
            <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
              3 caravanas activas cerca de ti
            </AppText>
            <View style={styles.liveDot} />
          </View>
        </View>

        <View style={styles.features}>
          {features.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: `${feature.color}16` }]}>
                <Ionicons name={feature.icon} size={18} color={feature.color} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{feature.title}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {feature.detail}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button
            label="Crear mi cuenta"
            icon="person-add-outline"
            size="lg"
            onPress={() => router.push('/sign-up')}
          />
          <Button
            label="Ya tengo cuenta"
            icon="log-in-outline"
            variant="secondary"
            onPress={() => router.push('/sign-in')}
          />
          <Button
            label={enteringDemo ? 'Entrando…' : 'Explorar en modo demo'}
            icon="play-outline"
            variant="ghost"
            loading={enteringDemo}
            onPress={enterDemo}
          />
        </View>

        {!isSupabaseConfigured ? (
          <AuthNotice
            tone="info"
            message="Modo local activo: las cuentas reales se habilitan al configurar Supabase. En la demo todo se guarda solo en este dispositivo."
          />
        ) : null}

        <View style={styles.legal}>
          <AppText variant="caption" color={colors.dim} align="center">
            Al continuar aceptas las reglas de conducción responsable de Caravana.
            Los retos miden llegada, nunca velocidad.
          </AppText>
          <Pressable
            onPress={() => router.push('/sign-in')}
            hitSlop={8}
            style={styles.legalLink}
          >
            <AppText variant="caption" color={colors.textSoft}>
              ¿Ya tienes una cuenta? <AppText variant="caption" color={colors.accent}>Entra aquí</AppText>
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  background: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  orb: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  hero: {
    marginTop: spacing['4xl'],
    gap: spacing.md,
  },
  title: {
    fontSize: 44,
    lineHeight: 47,
    letterSpacing: -1.6,
  },
  subtitle: {
    maxWidth: 330,
    lineHeight: 21,
  },
  routeCard: {
    marginTop: spacing['2xl'],
    backgroundColor: 'rgba(16,21,27,0.92)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingVertical: spacing.md,
    marginTop: -6,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarItem: {
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 17,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  features: {
    marginTop: spacing['2xl'],
    gap: 9,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: spacing['2xl'],
    gap: 9,
  },
  legal: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  legalLink: {
    alignSelf: 'center',
  },
});
