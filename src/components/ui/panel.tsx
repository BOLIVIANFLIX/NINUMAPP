/** Piezas visuales compartidas del estilo "Apple" aprobado en el mockup
 * (ninuma-agente/design/ninuma-app-propuesta.html): tarjetas blancas redondeadas sobre
 * fondo gris, filas de lista con separador, pills de estado y etiquetas de sección. */

import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

export function ListCard({ children, style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View style={[styles.listCard, { backgroundColor: theme.backgroundElement }, style]} {...rest}>
      {children}
    </View>
  );
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
  last,
  onPress,
}: {
  left?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[styles.listRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }]}>
      {left}
      <View style={styles.listRowMain}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.listRowSub}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </Wrapper>
  );
}

export function Ficha({ children, style }: ViewProps) {
  const theme = useTheme();
  return <View style={[styles.ficha, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

export function FilaFicha({
  etiqueta,
  valor,
  last,
  multilinea,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  last?: boolean;
  /** Para textos largos (p.ej. la descripción completa de un correo) -- etiqueta
   * arriba y valor debajo, sin cortar a una sola línea. Ariadna, 2026-08-24: el
   * cuadro de "Correo sin resolver" solo dejaba leer el principio del correo. */
  multilinea?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        multilinea ? styles.filaFichaMultilinea : styles.filaFicha,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filaFichaEtiqueta} numberOfLines={1}>
        {etiqueta}
      </ThemedText>
      {typeof valor === 'string' ? (
        <ThemedText
          type="smallBold"
          style={multilinea ? styles.filaFichaValorMultilinea : styles.filaFichaValor}
          numberOfLines={multilinea ? undefined : 1}>
          {valor}
        </ThemedText>
      ) : (
        valor
      )}
    </View>
  );
}

export type PillColor = 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Pill({ children, color = 'accent' }: { children: string; color?: PillColor }) {
  const theme = useTheme();
  const bg: Record<PillColor, string> = {
    accent: theme.accentSoft,
    success: theme.successSoft,
    warning: theme.warningSoft,
    danger: theme.dangerSoft,
    info: theme.infoSoft,
  };
  const fg: Record<PillColor, string> = {
    accent: theme.accent,
    success: theme.success,
    warning: theme.warningText,
    danger: theme.danger,
    info: theme.info,
  };
  return (
    <View style={[styles.pill, { backgroundColor: bg[color] }]}>
      <ThemedText type="small" style={[styles.pillText, { color: fg[color] }]}>
        {children}
      </ThemedText>
    </View>
  );
}

export function Dot({ color = 'accent' }: { color?: PillColor }) {
  const theme = useTheme();
  const map: Record<PillColor, string> = {
    accent: theme.accent,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    info: theme.info,
  };
  return <View style={[styles.dot, { backgroundColor: map[color] }]} />;
}

export function Avatar({ iniciales }: { iniciales: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {iniciales}
      </ThemedText>
    </View>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiRow}>{children}</View>;
}

export function KpiCard({ label, value, delta, wide }: { label: string; value: string; delta?: string; wide?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.backgroundElement }, wide && styles.kpiWide]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.kpiLabel}>
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.kpiValue}>
        {value}
      </ThemedText>
      {delta ? (
        <ThemedText type="small" style={[styles.kpiDelta, { color: theme.success }]}>
          {delta}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Segmented({ opciones, activo, onCambiar }: { opciones: string[]; activo: string; onCambiar: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {opciones.map((op) => {
        const activa = op === activo;
        return (
          <Pressable
            key={op}
            onPress={() => onCambiar(op)}
            style={[styles.seg, activa && { backgroundColor: theme.backgroundElement, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <ThemedText type="smallBold" style={{ color: activa ? theme.text : theme.textSecondary, textAlign: 'center' }}>
              {op}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function GradientCard({ title, subtitle, boton, onPress }: { title: string; subtitle: string; boton: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.gradientCard}>
      <View style={styles.gradientRow}>
        <View style={styles.gradientTextBox}>
          <ThemedText type="smallBold" style={styles.gradientTitle}>
            {title}
          </ThemedText>
          <ThemedText type="small" style={styles.gradientSub}>
            {subtitle}
          </ThemedText>
        </View>
        <View style={styles.gradientBtn}>
          <ThemedText type="smallBold" style={styles.gradientBtnText}>
            {boton} ↗
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: Spacing.four, marginBottom: Spacing.two, letterSpacing: 0.3 },
  listCard: { borderRadius: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three - 3 },
  listRowMain: { flex: 1, minWidth: 0, gap: 1 },
  listRowSub: { marginTop: 1 },
  ficha: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  filaFicha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: 10 },
  filaFichaMultilinea: { paddingVertical: 10, gap: 4 },
  filaFichaEtiqueta: { flexShrink: 1 },
  filaFichaValor: { textAlign: 'right' },
  filaFichaValorMultilinea: { textAlign: 'left', lineHeight: 20 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  kpi: { flexGrow: 1, flexBasis: '47%', borderRadius: 18, padding: Spacing.three },
  kpiWide: { flexBasis: '100%' },
  kpiLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 },
  kpiValue: { fontSize: 26, lineHeight: 30 },
  kpiDelta: { marginTop: 4, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  seg: { flex: 1, paddingVertical: 6, borderRadius: 8 },
  gradientCard: { borderRadius: 18, padding: Spacing.three + 2, backgroundColor: '#8f3560', overflow: 'hidden' },
  gradientRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  gradientTextBox: { flex: 1 },
  gradientTitle: { color: '#fff' },
  gradientSub: { color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  gradientBtn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  gradientBtnText: { color: '#1c1c1e' },
});
