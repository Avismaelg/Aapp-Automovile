import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  IconButton,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '@/src/components/ui';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import {
  armDetour,
  offsetPoint,
  PHASE_LABELS,
  runParkingScenario,
  runRecordedTripScenario,
  runTrafficScenario,
  setCruiseKmh,
  setSimParty,
  simulateIncomingInvite,
  startRally,
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

  const routeTo = (
    target: { latitude: number; longitude: number; label: string },
    stops: { latitude: number; longitude: number; label: string }[] = [],
  ) => {
    ensureStarted();
    const store = useChosenDestination.getState();
    // Los destinos de prueba no se guardan en tus recientes.
    const recents = store.recents.filter((item) => item.label !== TEST_LABEL);
    // Nunca se comparte con una party real.
    store.setDestination({ ...target, personal: true });
    useChosenDestination.setState({ recents, stops: [] });
    const from = sim.fix ?? live.location;
    for (const stop of stops) store.addStop(stop, from);
    store.startNavigation();
    waitForRoute();
    toMap();
  };

  const testRoute = () => {
    const from = sim.fix ?? live.location;
    const [latitude, longitude] = offsetPoint([from.latitude, from.longitude], 40, 1500);
    routeTo({ latitude, longitude, label: TEST_LABEL });
  };

  // Ruta de 2,2 km con dos paradas por el camino: se hacen en orden («Parada
  // hecha») y la ruta sigue sola a la siguiente.
  const routeWithStops = () => {
    const from = sim.fix ?? live.location;
    const origin: [number, number] = [from.latitude, from.longitude];
    const at = (meters: number) => offsetPoint(origin, 40, meters);
    const [latitude, longitude] = at(2200);
    const [s1lat, s1lng] = at(700);
    const [s2lat, s2lng] = at(1400);
    routeTo({ latitude, longitude, label: TEST_LABEL }, [
      { latitude: s1lat, longitude: s1lng, label: 'Parada de prueba 1' },
      { latitude: s2lat, longitude: s2lng, label: 'Parada de prueba 2' },
    ]);
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

  const recordedTrip = () => {
    ensureStarted();
    useParking.getState().clearSpot();
    runRecordedTripScenario();
    toMap();
  };

  // Convoy de 5 con reto: tú conduces por calles hasta la meta y 4 amigos
  // llegan desde otros puntos. La barra muestra la clasificación en vivo.
  const rallyTest = () => {
    ensureStarted();
    const goal = startRally();
    if (goal) routeTo({ ...goal, label: TEST_LABEL });
  };

  const invite = () => {
    ensureStarted();
    setSimParty(false);
    simulateIncomingInvite();
    toMap();
  };

  const city = () => {
    ensureStarted();
    setSimParty(true, 1000);
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
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" size={40} onPress={() => router.back()} />
      </View>
      <ScreenHeader title="Simulador" subtitle="Prueba la app sin conducir" />

      <Card style={styles.status}>
        <View style={[styles.statusDot, sim.active && styles.statusDotOn]} />
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

      <SectionHeader title="Velocidad de crucero (km/h)" />
      <View style={styles.speeds}>
        {SPEEDS.map((speed) => (
          <Pressable
            key={speed}
            onPress={() => setCruiseKmh(speed)}
            style={[styles.speed, sim.cruiseKmh === speed && styles.speedActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: sim.cruiseKmh === speed }}
          >
            <AppText variant="bodyStrong" color={sim.cruiseKmh === speed ? colors.bg : colors.textSoft}>
              {speed}
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
          icon="stats-chart-outline"
          title="Viaje completo (se graba)"
          detail="Ciudad, un tapón, 1,2 km de avenida y aparcar. Se guarda en Mis rutas como prueba (no cuenta en tus totales) y se borra al parar."
          onPress={recordedTrip}
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
        <Test
          icon="git-commit-outline"
          title="Ruta con 2 paradas"
          detail="2,2 km con dos paradas por el camino. Se marcan «Parada hecha» en orden y la ruta sigue sola a la siguiente."
          onPress={routeWithStops}
        />
        <Test
          icon="trophy-outline"
          title="Convoy de 5 con reto"
          detail="4 amigos salen de sitios distintos hacia tu meta (a 2,6 km). Tú vas por calles. Arriba ves la clasificación en vivo y en la pestaña Party su velocidad."
          onPress={rallyTest}
        />
        <Test
          icon="mail-unread-outline"
          title="Un amigo te invita a su party"
          detail="A los 3 s llega el aviso «Laura te invita a su convoy». Con «Unirme» entras y la ves en el mapa."
          onPress={invite}
        />
        <Test
          icon="people-circle-outline"
          title="Ciudad con 1.000 usuarios"
          detail="75 parties y gente sola usando la app a la vez. Vas en una party de 12: ves solo la tuya y un contador dice cuánto tráfico llega a tu teléfono."
          onPress={city}
        />
        <View style={styles.partyRow}>
          <View style={styles.testIcon}>
            <Ionicons name="people-outline" size={18} color={colors.text} />
          </View>
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
            trackColor={{ false: colors.surfaceHigh, true: colors.green }}
            thumbColor={colors.white}
          />
        </View>
      </Card>

      {sim.active ? (
        <Button
          label="Parar simulación"
          variant="danger"
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
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <View style={styles.statusText}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {detail}
        </AppText>
      </View>
      <Ionicons name="play-circle" size={26} color={colors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', marginTop: spacing.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.dim },
  statusDotOn: { backgroundColor: colors.green },
  statusText: { flex: 1, gap: 2 },
  speeds: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  speed: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  speedActive: { backgroundColor: colors.text },
  tests: { paddingVertical: spacing.xs },
  test: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  testIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
