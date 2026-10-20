import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { icons } from '@/components/ui/icons';
import { useAuth } from '@/state/AuthContext';
import { colors } from '@/theme/theme';

/**
 * Zakładki zależne od roli: tytuły „Klub” i „Frekwencja” pokazują trenerowi
 * szerszy zakres tego samego ekranu, bez duplikowania tras.
 */
export default function TabsLayout() {
  const { isStaff } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dziś', tabBarIcon: ({ focused }) => <TabGlyph glyph={icons.checkIn} focused={focused} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Grafik', tabBarIcon: ({ focused }) => <TabGlyph glyph={icons.calendar} focused={focused} /> }} />
      <Tabs.Screen name="sparring" options={{ title: 'Sparingi', tabBarIcon: ({ focused }) => <TabGlyph glyph={icons.sparring} focused={focused} /> }} />
      <Tabs.Screen name="members" options={{ title: isStaff ? 'Klub' : 'Ludzie', tabBarIcon: ({ focused }) => <TabGlyph glyph={icons.users} focused={focused} /> }} />
      <Tabs.Screen name="stats" options={{ title: isStaff ? 'Frekwencja' : 'Moje', tabBarIcon: ({ focused }) => <TabGlyph glyph={icons.stats} focused={focused} /> }} />
    </Tabs>
  );
}

const TabGlyph: React.FC<{ glyph: string; focused: boolean }> = ({ glyph, focused }) => (
  <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
);
