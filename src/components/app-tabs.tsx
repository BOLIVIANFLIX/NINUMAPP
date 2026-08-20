import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// Iconos nativos de cada plataforma (SF Symbols en iOS, Material Icons en Android) --
// sin assets propios que mantener. Badges numéricos en Obrador (alertas de Home
// Assistant/materia prima) y Avisos (pedidos/notificaciones pendientes) se activan
// más adelante, cuando esas pantallas tengan datos reales que contar.
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pedidos">
        <NativeTabs.Trigger.Label>Pedidos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart.fill" md="shopping_cart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="obrador">
        <NativeTabs.Trigger.Label>Obrador</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="flame.fill" md="local_fire_department" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendario">
        <NativeTabs.Trigger.Label>Calendario</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="avisos">
        <NativeTabs.Trigger.Label>Avisos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell.fill" md="notifications" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
