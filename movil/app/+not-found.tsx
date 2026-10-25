import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { colors, spacing } from '@/src/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Ruta no encontrada' }} />
      <View style={styles.container}>
        <AppText variant="display" color={colors.accent}>
          Off-road
        </AppText>
        <AppText variant="title" align="center" style={{ marginTop: spacing.sm }}>
          Esta ruta no existe
        </AppText>
        <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 6 }}>
          Puede que el enlace haya expirado o que la party ya haya terminado.
        </AppText>
        <Link href="/" style={styles.link}>
          <AppText variant="bodyStrong" color={colors.accent}>
            Volver al inicio
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  link: { marginTop: spacing.xl, paddingVertical: 12 },
});
