import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChosenDestination } from '@/src/store/destination';
import { colors, fonts, radius } from '@/src/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isNavigating = useChosenDestination((state) => state.isNavigating);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.dim,
        tabBarStyle: isNavigating
          ? { display: 'none' }
          : [styles.tabBar, { height: 62 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8) }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="party"
        options={{
          title: 'Party',
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ focused }) => (
            <View style={[styles.partyIcon, focused && styles.partyIconActive]}>
              <Ionicons name="radio" size={20} color={focused ? '#120802' : colors.text} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Retos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'flag' : 'flag-outline'} size={21} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garaje',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'car-sport' : 'car-sport-outline'} size={23} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: 'Consumo',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'speedometer' : 'speedometer-outline'} size={23} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    elevation: 0,
  },
  tabItem: {
    paddingVertical: 4,
    minWidth: 0,
    flex: 1,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0,
    marginTop: 2,
  },
  partyIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyIconActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
