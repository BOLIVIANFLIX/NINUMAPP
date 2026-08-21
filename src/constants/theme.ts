/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// #b5457a es el rosa de marca de NINUMÁ (mismo acento que la web/TWA actual) --
// NINUMAPP es un proyecto de código independiente, pero mantiene la identidad visual.
// Tokens calcados del mockup aprobado (ninuma-agente/design/ninuma-app-propuesta.html):
// fondo de pantalla gris iOS, tarjetas blancas, un acento de marca y los mismos colores
// de estado (verde/amarillo/rojo/azul) que ya usa el calendario.
export const Colors = {
  light: {
    text: '#1C1C1E',
    textSecondary: '#8E8E93',
    background: '#F2F2F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E9E9EE',
    separator: '#E5E5EA',
    accent: '#b5457a',
    accentSoft: '#F6E3EC',
    danger: '#FF3B30',
    dangerSoft: '#FFE9E8',
    success: '#34C759',
    successSoft: '#E3F8E9',
    warning: '#FF9F0A',
    warningSoft: '#FFF2E0',
    warningText: '#A15C00',
    info: '#5B8FD4',
    infoSoft: '#E7EFFA',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    background: '#000000',
    backgroundElement: '#1C1C1E',
    backgroundSelected: '#2C2C2E',
    separator: '#38383A',
    accent: '#e88bb2',
    accentSoft: '#3A2530',
    danger: '#FF453A',
    dangerSoft: '#3A1F1D',
    success: '#30D158',
    successSoft: '#132A17',
    warning: '#FF9F0A',
    warningSoft: '#332405',
    warningText: '#FF9F0A',
    info: '#5B8FD4',
    infoSoft: '#1B2636',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
