import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, Card, IconButton, Screen, SectionHeader } from '@/src/components/ui';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import {
  armDetour,
  offsetPoint,
  PHASE_LABELS,
  runParkingScenario,
  runTrafficScenario,
  setCruiseKmh,
  setSimParty,
  startSimulation,
  stopSimulation,
  useSimulator,
  waitForRoute,
} from '@/src/lib/simulator';
import { useChosenDestination } from '@/src/store/destination';
import { useParking } from '@/src/store/parking';
import { colors, radius, spacing } from '@/src/theme';

const SPEEDS = [30, 50, 80, 110];
const TEST_LABEL = 'Destino de prueba';

// Herramienta de pruebas: mueve tu posición sin conducir para revisar rutas,
// llegada, aparcamiento, coche 3D, línea de conducción y party.
export default function SimulatorScreen() {
  const router = useRouter();
  const live = useLiveLocation();
  const sim = useSimulator();
  const destination = useChosenDestination((state) => state.destination);

  const toMap = () => router.replace('/');

  const ensureStarted = () => {
    if (!useSimulator.getState().active) startSimulation(live.location);
  };

  const routeTo = (target: { latitude: number; longitude: number; label: string }) => {
    ensureStarted();
    const store = useChosenDestination.getState();
    // Los destinos de prueba no se guardan en tus recientes.
    const recents = store.recents.filter((item) => item.label !== TEST_LABEL);
    store.setDestination(target);
    useChosenDestination.setState({ recents });
    store.startNavigation();
    waitForRoute();
    toMap();
  };

  const testRoute = () => {
    const from = sim.fix ?? live.location;
    const [latitude, longitude] = offsetPoint([from.latitude, from.longitude], 40, 1500);
    routeTo({ latitude, longitude, label: TEST_LABEL });
  };

  const detour = () => {
    const from = sim.fix ?? live.location;
    const [latitude, longitude] = offsetPoint([from.latitude, from.longitude], 40, 1500);
    ensureStarted();
    armDetour();
    routeTo({ latitude, longitude, label: TEST_LABEL });
  };

  const parking = () => {
    ensureStarted();
    useParking.getState().clearSpot();
    runParkingScenario();
    toMap();
  };

  const traffic = (withSensor: boolean) => {
    ensureStarted();
    useParking.getState().clearSpot();
    runTrafficScenario(withSensor);
    toMap();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <AppText variant="h2" style={styles.title}>
          Simulador
        </AppText>
      </View>

      <Card style={styles.status}>
        <Ionicons name="flask" size={20} color="#a78bfa" />
        <View style={styles.statusText}>
          <AppText variant="bodyStrong">
            {sim.active ? `${PHASE_LABELS[sim.phase]} · ${Math.round(sim.fix?.speedKmh ?? 0)} km/h` : 'Apagado'}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {sim.active
              ? 'Tu posición es simulada: no se graban viajes ni se publica en la party.'
              : 'Usa tu GPS real. Elige una prueba para empezar.'}
          </AppText>
        </View>
      </Card>

      <SectionHeader title="Velocidad de crucero" />
      <View style={styles.speeds}>
        {SPEEDS.map((speed) => (
          <Pressable
            key={speed}
            onPress={() => setCruiseKmh(speed)}
            style={[styles.speed, sim.cruiseKmh === speed && styles.speedActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: sim.cruiseKmh === speed }}
          >
            <AppText variant="bodyStrong" color={sim.cruiseKmh === speed ? '#120802' : colors.text}>
              {speed} km/h
            </AppText>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Pruebas" />
      <Card style={styles.tests}>
        <Test
          icon="navigate"
          title="Ruta de prueba (1,5 km)"
          detail="Calcula una ruta real, navega con voz y línea de conducción, frena en las curvas y termina al llegar."
          onPress={testRoute}
        />
        {destination ? (
          <Test
            icon="flag"
            title={`Ruta a ${destination.label}`}
            detail="Recorre la ruta al destino que tienes elegido."
            onPress={() => routeTo(destination)}
          />
        ) : null}
        <Test
          icon="git-branch"
          title="Salirse de la ruta"
          detail="Conduce un tramo, se desvía 250 m por otra calle y comprueba que la ruta se recalcula y sigue."
          onPress={detour}
        />
        <Test
          icon="car"
          title="Aparcar, caminar y volver"
          detail="Llega, aparca (el sensor detecta que bajas del coche), camina 150 m (punto azul y coche aparcado), vuelve y arranca."
          onPress={parking}
        />
        <Test
          icon="hourglass"
          title="Atasco (con sensor)"
          detail="Varios minutos parado y a trompicones con el teléfono diciendo «en vehículo». No debe marcar aparcamiento."
          onPress={() => traffic(true)}
        />
        <Test
          icon="hourglass-outline"
          title="Atasco (solo GPS)"
          detail="El mismo tapón sin sensor de actividad. Tampoco debe marcar aparcamiento."
          onPress={() => traffic(false)}
        />
        <View style={styles.partyRow}>
          <Ionicons name="people" size={20} color={colors.accent} />
          <View style={styles.statusText}>
            <AppText variant="bodyStrong">Party en convoy</AppText>
            <AppText variant="caption" color={colors.muted}>
              Tres amigos simulados te siguen en el mapa y en la pestaña Party.
            </AppText>
          </View>
          <Switch
            value={sim.party}
            onValueChange={(value) => {
              ensureStarted();
              setSimParty(value);
            }}
            trackColor={{ false: colors.surfaceHigh, true: colors.accent }}
          />
        </View>
      </Card>

      {sim.active ? (
        <Button
          label="Parar simulación"
          icon="stop-circle-outline"
          variant="secondary"
          onPress={stopSimulation}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
    </Screen>
  );
}

function Test({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.test, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.testIcon}>
        <Ionicons name={icon} size={18} color="#120802" />
      </View>
      <View style={styles.statusText}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {detail}
        </AppText>
      </View>
      <Ionicons name="play" size={16} color={colors.lime} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusText: { flex: 1, gap: 2 },
  speeds: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  speed: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  tests: { gap: spacing.md },
  test: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  testIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
