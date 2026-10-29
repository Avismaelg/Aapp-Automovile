import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/src/components/ui';
import { colors, spacing } from '@/src/theme';

type Props = { children: ReactNode };

type State = {
  error: Error | null;
};

/** Evita una pantalla negra cuando una pantalla nativa falla al renderizar. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // El sistema de errores de producción puede enganchar este punto más
    // adelante sin enseñar detalles internos al usuario.
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <AppText variant="h2" color={colors.accent}>!</AppText>
          </View>
          <AppText variant="h1" align="center">
            Algo se detuvo
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={styles.message}>
            Caravana no pudo mostrar esta pantalla. Tus datos guardados siguen a salvo.
          </AppText>
          <Button label="Reintentar" icon="refresh" onPress={this.retry} style={styles.button} />
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.35)',
    marginBottom: spacing.lg,
  },
  message: { marginTop: spacing.sm, lineHeight: 22 },
  button: { marginTop: spacing['2xl'], minWidth: 180 },
});
