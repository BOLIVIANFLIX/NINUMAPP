import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBadges } from '@/hooks/use-tab-badges';

// Solo para el target web (desarrollo/pruebas rápidas en navegador) -- el objetivo
// real del proyecto es Android/iOS nativo, ver app-tabs.tsx (NativeTabs).
export default function AppTabs() {
  const badges = useTabBadges();

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Inicio</TabButton>
          </TabTrigger>
          <TabTrigger name="pedidos" href="/pedidos" asChild>
            <TabButton>Pedidos</TabButton>
          </TabTrigger>
          <TabTrigger name="obrador" href="/obrador" asChild>
            <TabButton badge={badges.obrador}>Obrador</TabButton>
          </TabTrigger>
          <TabTrigger name="calendario" href="/calendario" asChild>
            <TabButton>Calendario</TabButton>
          </TabTrigger>
          <TabTrigger name="avisos" href="/avisos" asChild>
            <TabButton badge={badges.avisos}>Avisos</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, badge, ...props }: TabTriggerSlotProps & { badge?: number }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={isFocused ? 'backgroundSelected' : 'backgroundElement'} style={[styles.tabButtonView, styles.tabButtonRow]}>
        <ThemedText type="small" style={isFocused ? { color: colors.accent } : undefined} themeColor={isFocused ? undefined : 'textSecondary'}>
          {children}
        </ThemedText>
        {!!badge && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <ThemedText type="small" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </View>
        )}
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  tabButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
});
