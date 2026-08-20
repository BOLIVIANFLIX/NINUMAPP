import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function BotonPrimario({
  onPress,
  cargando,
  disabled,
  texto,
}: {
  onPress: () => void;
  cargando?: boolean;
  disabled?: boolean;
  texto: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || cargando}
      style={[styles.boton, { backgroundColor: theme.accent, opacity: disabled || cargando ? 0.5 : 1 }]}>
      {cargando ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.texto}>{texto}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
