import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, IconButton, Screen } from '@/src/components/ui';
import { privacyPolicy } from '@/src/lib/privacy-policy';
import { colors, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// OTR-01: política de privacidad publicada dentro de la app y accesible sin
// cuenta (desde Bienvenida, Registro, Perfil y el aviso de ubicación).
export default function PrivacyScreen() {
  const router = useRouter();
  const policy = privacyPolicy();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon="chevron-back" size={40} onPress={goBack} accessibilityLabel={t('Volver')} />
        <AppText variant="h2">{t('Política de privacidad')}</AppText>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <AppText variant="caption" color={colors.muted}>
          {policy.updated}
        </AppText>
        <AppText variant="body" color={colors.textSoft}>
          {policy.intro}
        </AppText>
        {policy.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText variant="h3">{section.title}</AppText>
            {section.items.map((item) => (
              <AppText key={item} variant="body" color={colors.textSoft}>
                • {item}
              </AppText>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  body: { gap: spacing.md, paddingVertical: spacing.lg },
  section: { gap: spacing.xs },
});
