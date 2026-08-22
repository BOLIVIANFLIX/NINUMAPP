import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentoDetalle } from '@/components/documento-detalle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Dot, KpiCard, KpiRow, ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { crearGasto, eliminarGasto, marcarGastoPagado, mensajeError, obtenerIngresosDelMes } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const ETIQUETAS_CATEGORIA: Record<string, string> = {
  materia_prima: 'Materia prima (a mano)',
  alquiler: 'Alquiler',
  electricidad: 'Electricidad',
  agua: 'Agua',
  telefono_internet: 'Teléfono / Internet',
  herramientas: 'Herramientas de trabajo',
  envases_embalajes: 'Envases y embalajes',
  seguros: 'Seguros',
  gestoria_asesoria: 'Gestoría / asesoría',
  cuota_autonomo: 'Cuota de autónomo / Seguridad Social',
  marketing: 'Marketing y publicidad',
  comisiones_bancarias: 'Comisiones bancarias / TPV',
  basuras_tasas: 'Basuras / tasas municipales',
  desplazamientos: 'Desplazamientos',
  otros: 'Otros',
};

function mesAnterior(anio: number, mes: number): [number, number] {
  return mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
}
function mesSiguiente(anio: number, mes: number): [number, number] {
  return mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
}

// Réplica de /panel/ingresos -- mes navegable, mismas cifras y CRUD de gastos fijos.
export function IngresosGastos({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [numeroAbierto, setNumeroAbierto] = useState<string | null>(null);
  const mesParam = `${anio}-${String(mes).padStart(2, '0')}`;

  const { data, isLoading, error } = useQuery({ queryKey: ['ingresos', mesParam], queryFn: () => obtenerIngresosDelMes(mesParam) });

  if (numeroAbierto) {
    return <DocumentoDetalle numero={numeroAbierto} etiquetaVolver="Ingresos y gastos" onVolver={() => setNumeroAbierto(null)} />;
  }

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['ingresos', mesParam] });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Inicio
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Ingresos y gastos
          </ThemedText>

          <View style={styles.navMes}>
            <Pressable onPress={() => { const [a, m] = mesAnterior(anio, mes); setAnio(a); setMes(m); }}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>‹ {MESES[mesAnterior(anio, mes)[1] - 1]}</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">{MESES[mes - 1]} {anio}</ThemedText>
            {data?.es_mes_actual ? (
              <ThemedText type="small" themeColor="textSecondary">Mes en curso</ThemedText>
            ) : (
              <Pressable onPress={() => { const [a, m] = mesSiguiente(anio, mes); setAnio(a); setMes(m); }}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>{MESES[mesSiguiente(anio, mes)[1] - 1]} ›</ThemedText>
              </Pressable>
            )}
          </View>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}

          {data && (
            <>
              <KpiRow>
                <KpiCard label="Ingresos (sin IVA)" value={eur.format(data.resumen.ingresos)} />
                <KpiCard label="Margen bruto" value={eur.format(data.resumen.margen)} />
                <KpiCard label="Nº albaranes" value={String(data.documentos.length)} wide />
              </KpiRow>

              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                ALBARANES DE ESTE MES (CON IVA)
              </ThemedText>
              {data.documentos.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">Sin albaranes registrados este mes.</ThemedText>
              ) : (
                <ListCard>
                  {data.documentos.map((d, i) => (
                    <ListRow
                      key={d.numero_documento}
                      last={i === data.documentos.length - 1}
                      onPress={() => setNumeroAbierto(d.numero_documento)}
                      title={d.numero_documento}
                      subtitle={`${d.cliente} · ${new Date(d.fecha).toLocaleDateString('es-ES')}`}
                      right={<ThemedText type="smallBold">{eur.format(d.total)}</ThemedText>}
                    />
                  ))}
                </ListCard>
              )}

              <KpiRow>
                <KpiCard label="Materia prima" value={eur.format(data.total_materia_prima)} />
                <KpiCard label="Gastos fijos" value={eur.format(data.total_gastos_fijos)} />
                <KpiCard
                  label="Margen neto"
                  value={eur.format(data.margen_neto)}
                  wide
                />
              </KpiRow>

              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                GASTOS
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
                La materia prima de los tickets escaneados en Inventario se suma sola -- aquí puedes añadir a mano cualquier otro gasto.
              </ThemedText>
              {data.gastos_fijos.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">Sin gastos registrados a mano este mes.</ThemedText>
              ) : (
                <ListCard>
                  {data.gastos_fijos.map((g, i) => (
                    <ListRow
                      key={g.id}
                      last={i === data.gastos_fijos.length - 1}
                      left={<Dot color={g.pagado ? 'success' : 'warning'} />}
                      title={`${ETIQUETAS_CATEGORIA[g.categoria] ?? g.categoria}${g.recurrente ? ' 🔁' : ''}${g.pagado ? '' : ' · pendiente'}`}
                      subtitle={[g.descripcion, g.lugar_compra && `Lugar: ${g.lugar_compra}`, g.producto && `Producto: ${g.producto}`].filter(Boolean).join(' · ') || null}
                      right={
                        <View style={styles.accionesGasto}>
                          <ThemedText type="smallBold">{eur.format(g.importe)}</ThemedText>
                          <View style={styles.botonesGasto}>
                            {!g.pagado && (
                              <Pressable onPress={async () => { await marcarGastoPagado(g.id); invalidar(); }}>
                                <ThemedText type="small" style={{ color: theme.success, fontWeight: '700' }}>Pagar</ThemedText>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() =>
                                Alert.alert('¿Eliminar este gasto?', undefined, [
                                  { text: 'Cancelar', style: 'cancel' },
                                  { text: 'Eliminar', style: 'destructive', onPress: async () => { await eliminarGasto(g.id); invalidar(); } },
                                ])
                              }>
                              <ThemedText type="small" themeColor="textSecondary">✕</ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      }
                    />
                  ))}
                </ListCard>
              )}

              <FormularioGasto mes={mesParam} mesActual={data.es_mes_actual} onCreado={invalidar} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FormularioGasto({ mes, mesActual, onCreado }: { mes: string; mesActual: boolean; onCreado: () => void }) {
  const theme = useTheme();
  const [categoria, setCategoria] = useState('materia_prima');
  const [descripcion, setDescripcion] = useState('');
  const [lugarCompra, setLugarCompra] = useState('');
  const [producto, setProducto] = useState('');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState(() => (mesActual ? new Date().toISOString().slice(0, 10) : `${mes}-01`));
  const [recurrente, setRecurrente] = useState(false);
  const [pagado, setPagado] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const valor = parseFloat(importe.replace(',', '.'));
    if (Number.isNaN(valor) || valor <= 0 || !fecha) return;
    setGuardando(true);
    try {
      await crearGasto({
        categoria, importe: valor, fecha, descripcion: descripcion || undefined,
        lugar_compra: categoria === 'materia_prima' ? lugarCompra || undefined : undefined,
        producto: categoria === 'materia_prima' ? producto || undefined : undefined,
        recurrente, pagado,
      });
      setDescripcion(''); setLugarCompra(''); setProducto(''); setImporte('');
      onCreado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">Categoría</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsCategoria}>
        {Object.entries(ETIQUETAS_CATEGORIA).map(([valor, etiqueta]) => (
          <Pressable
            key={valor}
            onPress={() => setCategoria(valor)}
            style={[styles.chip, { borderColor: categoria === valor ? theme.accent : theme.separator }]}>
            <ThemedText type="small" style={{ color: categoria === valor ? theme.accent : theme.textSecondary }}>{etiqueta}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Descripción (opcional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
      />
      {categoria === 'materia_prima' && (
        <>
          <TextInput
            value={lugarCompra}
            onChangeText={setLugarCompra}
            placeholder="Lugar de compra (opcional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
          />
          <TextInput
            value={producto}
            onChangeText={setProducto}
            placeholder="Producto (opcional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
          />
        </>
      )}
      <View style={styles.filaCampos}>
        <TextInput
          value={importe}
          onChangeText={setImporte}
          placeholder="Importe €"
          keyboardType="decimal-pad"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.separator }]}
        />
        <TextInput
          value={fecha}
          onChangeText={setFecha}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.separator }]}
        />
      </View>
      <View style={styles.filaSwitch}>
        <ThemedText type="small">Repetir cada mes automáticamente</ThemedText>
        <Switch value={recurrente} onValueChange={setRecurrente} />
      </View>
      <View style={styles.filaSwitch}>
        <ThemedText type="small">Ya está pagado</ThemedText>
        <Switch value={pagado} onValueChange={setPagado} />
      </View>
      <Pressable onPress={guardar} disabled={guardando} style={[styles.botonGuardar, { backgroundColor: theme.accent }]}>
        {guardando ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Añadir gasto</ThemedText>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  centro: { marginTop: Spacing.five },
  navMes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing.two },
  seccion: { marginTop: Spacing.three, marginBottom: Spacing.one, letterSpacing: 0.3 },
  nota: { marginBottom: Spacing.two, lineHeight: 18 },
  accionesGasto: { alignItems: 'flex-end', gap: 4 },
  botonesGasto: { flexDirection: 'row', gap: Spacing.two },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  chipsCategoria: { flexDirection: 'row' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, marginRight: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  filaCampos: { flexDirection: 'row', gap: Spacing.two },
  filaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  botonGuardar: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.one },
});
