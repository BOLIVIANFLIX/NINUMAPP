import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha, KpiCard, KpiRow, ListCard, ListRow, Segmented } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tokenStore } from '@/lib/token-store';
import {
  guardarConfigCostes,
  guardarTiempoReceta,
  mensajeError,
  obtenerAnalisisPrecios,
  obtenerAnalisisProductos,
  obtenerAnalisisRecetas,
  obtenerAnalisisResumen,
  obtenerIvaTrimestre,
  urlTicketsPeriodo,
  type PeriodoAnalisis,
  type RecetaCoste,
} from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur3 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3, maximumFractionDigits: 3 });

type Sub = 'Resumen' | 'Productos' | 'Recetas' | 'Precios' | 'Impuestos';

export function trimestreActual(): { anio: number; trimestre: number } {
  const ahora = new Date();
  return { anio: ahora.getFullYear(), trimestre: Math.floor(ahora.getMonth() / 3) + 1 };
}

const PERIODOS: { valor: PeriodoAnalisis; etiqueta: string }[] = [
  { valor: 'semana', etiqueta: '7 días' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'anio', etiqueta: 'Este año' },
];

// Réplica de /panel/analisis -- 4 pestañas, mismas cifras/funciones de ninuma-agente
// (csv_contabilidad/costes/db) vía panel_agente, nunca recalculadas aquí.
export function AnalisisFinanciero({ onVolver, subInicial }: { onVolver: () => void; subInicial?: Sub }) {
  const theme = useTheme();
  const [sub, setSub] = useState<Sub>(subInicial ?? 'Resumen');
  const [p, setP] = useState<PeriodoAnalisis>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

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
            Análisis financiero
          </ThemedText>

          <Segmented opciones={['Resumen', 'Productos', 'Recetas', 'Precios', 'Impuestos']} activo={sub} onCambiar={(v) => setSub(v as Sub)} />

          {(sub === 'Resumen' || sub === 'Productos') && (
            <>
              <View style={styles.selectorPeriodo}>
                {PERIODOS.map((op) => (
                  <Pressable
                    key={op.valor}
                    onPress={() => setP(op.valor)}
                    style={[styles.chipPeriodo, { borderColor: p === op.valor ? theme.accent : theme.separator }]}>
                    <ThemedText type="small" style={{ color: p === op.valor ? theme.accent : theme.textSecondary, fontWeight: '700' }}>
                      {op.etiqueta}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setP('rango')} style={styles.enlaceRango}>
                <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700' }}>
                  {p === 'rango' ? '▾' : '▸'} Rango personalizado
                </ThemedText>
              </Pressable>
              {p === 'rango' && (
                <View style={styles.filaRango}>
                  <TextInput
                    value={desde}
                    onChangeText={setDesde}
                    placeholder="Desde YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.inputRango, { color: theme.text, borderColor: theme.separator }]}
                  />
                  <TextInput
                    value={hasta}
                    onChangeText={setHasta}
                    placeholder="Hasta YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.inputRango, { color: theme.text, borderColor: theme.separator }]}
                  />
                </View>
              )}
            </>
          )}

          {sub === 'Resumen' && <TabResumen p={p} desde={desde || undefined} hasta={hasta || undefined} />}
          {sub === 'Productos' && <TabProductos p={p} desde={desde || undefined} hasta={hasta || undefined} />}
          {sub === 'Recetas' && <TabRecetas />}
          {sub === 'Precios' && <TabPrecios />}
          {sub === 'Impuestos' && <TabImpuestos />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function TabResumen({ p, desde, hasta }: { p: PeriodoAnalisis; desde?: string; hasta?: string }) {
  const theme = useTheme();
  const { data, isLoading, error } = useQuery({ queryKey: ['analisis', 'resumen', p, desde, hasta], queryFn: () => obtenerAnalisisResumen(p, desde, hasta) });
  if (isLoading) return <ActivityIndicator color={theme.accent} style={styles.centro} />;
  if (error) return <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>;
  if (!data) return null;
  return (
    <KpiRow>
      <KpiCard label="Ingresos" value={eur.format(data.ingresos)} wide />
      <KpiCard label="Coste materia prima" value={eur.format(data.coste_materia_prima)} />
      <KpiCard label="Margen bruto" value={eur.format(data.margen)} />
      <KpiCard label="Margen sobre ingresos" value={data.margen_pct != null ? `${data.margen_pct.toFixed(0)}%` : '—'} wide />
    </KpiRow>
  );
}

function TabProductos({ p, desde, hasta }: { p: PeriodoAnalisis; desde?: string; hasta?: string }) {
  const theme = useTheme();
  const { data, isLoading, error } = useQuery({ queryKey: ['analisis', 'productos', p, desde, hasta], queryFn: () => obtenerAnalisisProductos(p, desde, hasta) });
  if (isLoading) return <ActivityIndicator color={theme.accent} style={styles.centro} />;
  if (error) return <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>;
  if (!data?.length) return <ThemedText type="small" themeColor="textSecondary" style={styles.centro}>Sin ventas registradas en este periodo.</ThemedText>;
  return (
    <ListCard>
      {data.map((r, i) => (
        <ListRow
          key={r.nombre}
          last={i === data.length - 1}
          title={r.nombre}
          subtitle={`${r.unidades.toFixed(0)} unidades · ${eur.format(r.ingresos)}`}
          right={
            <ThemedText type="smallBold" style={{ color: (r.margen_pct ?? 0) >= 0 ? theme.success : theme.danger }}>
              {r.margen_pct != null ? `${r.margen_pct.toFixed(0)}%` : '—'}
            </ThemedText>
          }
        />
      ))}
    </ListCard>
  );
}

function TabRecetas() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['analisis', 'recetas'], queryFn: obtenerAnalisisRecetas });
  const [precioHora, setPrecioHora] = useState('');
  const [horasMes, setHorasMes] = useState('');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);

  if (isLoading) return <ActivityIndicator color={theme.accent} style={styles.centro} />;
  if (error) return <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>;
  if (!data) return null;

  const cfgPrecioHora = precioHora || String(data.config.precio_hora_trabajo ?? '');
  const cfgHorasMes = horasMes || String(data.config.horas_productivas_mes ?? '');

  async function guardarConfig() {
    const ph = parseFloat(cfgPrecioHora.replace(',', '.'));
    const hm = parseFloat(cfgHorasMes.replace(',', '.'));
    if (Number.isNaN(ph) || Number.isNaN(hm) || ph < 0 || hm <= 0) return;
    setGuardandoConfig(true);
    try {
      await guardarConfigCostes(ph, hm);
      await queryClient.invalidateQueries({ queryKey: ['analisis', 'recetas'] });
    } finally {
      setGuardandoConfig(false);
    }
  }

  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
        TU PRECIO/HORA Y GASTOS FIJOS REPERCUTIDOS
      </ThemedText>
      <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.filaCampos}>
          <CampoNumero etiqueta="Precio/hora €" valor={cfgPrecioHora} onCambiar={setPrecioHora} />
          <CampoNumero etiqueta="Horas productivas/mes" valor={cfgHorasMes} onCambiar={setHorasMes} />
        </View>
        <Pressable onPress={guardarConfig} disabled={guardandoConfig} style={[styles.botonGuardarChico, { backgroundColor: theme.accent }]}>
          {guardandoConfig ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="small" style={{ color: '#fff', fontWeight: '700' }}>Guardar</ThemedText>}
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
        Con esto se reparten tus gastos fijos del mes entre tus horas productivas, y se suman a tu precio/hora para calcular el coste REAL de cada elaboración.
      </ThemedText>

      {data.recetas.map((r) => (
        <RecetaAcordeon key={r.id} receta={r} abierta={abierta === r.id} onToggle={() => setAbierta(abierta === r.id ? null : r.id)} />
      ))}
    </>
  );
}

function RecetaAcordeon({ receta, abierta, onToggle }: { receta: RecetaCoste; abierta: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [minutos, setMinutos] = useState(receta.minutos_tanda != null ? String(receta.minutos_tanda) : '');
  const [precioHoraReceta, setPrecioHoraReceta] = useState(String(receta.precio_hora_efectivo));
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const m = parseInt(minutos, 10);
    const ph = parseFloat(precioHoraReceta.replace(',', '.'));
    if (Number.isNaN(m) || Number.isNaN(ph) || m < 0 || ph < 0) return;
    setGuardando(true);
    try {
      await guardarTiempoReceta(receta.id, m, ph);
      await queryClient.invalidateQueries({ queryKey: ['analisis', 'recetas'] });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={[styles.acordeon, { backgroundColor: theme.backgroundElement }]}>
      <Pressable onPress={onToggle} style={styles.acordeonCabecera}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{receta.nombre}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{eur3.format(receta.coste_real)} / ud. real</ThemedText>
      </Pressable>
      {abierta && (
        <View style={styles.acordeonCuerpo}>
          <Ficha style={styles.fichaDesglose}>
            <FilaFicha etiqueta="Materia prima" valor={eur3.format(receta.coste_materia_prima)} />
            <FilaFicha etiqueta={`Mano de obra (${eur.format(receta.precio_hora_efectivo)}/h)`} valor={eur3.format(receta.coste_mano_obra)} />
            <FilaFicha etiqueta="Gastos fijos repercutidos" valor={eur3.format(receta.coste_fijo_repercutido)} />
            <FilaFicha etiqueta="Coste real" valor={eur3.format(receta.coste_real)} last />
          </Ficha>

          {receta.ingredientes.map((ing, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.ingrediente}>
              {ing.producto} · {ing.cantidad.toFixed(3)} · {eur3.format(ing.precio_unitario)}
            </ThemedText>
          ))}

          <View style={styles.filaCampos}>
            <CampoNumero etiqueta={`Minutos/tanda (${receta.base_servings.toFixed(0)} ud.)`} valor={minutos} onCambiar={setMinutos} />
            <CampoNumero etiqueta="Precio/hora para esta receta €" valor={precioHoraReceta} onCambiar={setPrecioHoraReceta} />
          </View>
          <Pressable onPress={guardar} disabled={guardando} style={[styles.botonGuardarChico, { backgroundColor: theme.backgroundSelected, marginTop: Spacing.two }]}>
            {guardando ? <ActivityIndicator color={theme.accent} size="small" /> : <ThemedText type="small" style={{ fontWeight: '700' }}>Guardar</ThemedText>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function TabPrecios() {
  const theme = useTheme();
  const { data, isLoading, error } = useQuery({ queryKey: ['analisis', 'precios'], queryFn: obtenerAnalisisPrecios });
  if (isLoading) return <ActivityIndicator color={theme.accent} style={styles.centro} />;
  if (error) return <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>;
  if (!data?.length) return <ThemedText type="small" themeColor="textSecondary" style={styles.centro}>Ninguna subida por encima del umbral detectada.</ThemedText>;
  return (
    <ListCard>
      {data.map((a, i) => (
        <ListRow
          key={a.ingrediente}
          last={i === data.length - 1}
          title={a.ingrediente}
          subtitle={`${eur.format(a.precio_anterior)} → ${eur.format(a.precio_actual)}`}
          right={<ThemedText type="smallBold" style={{ color: theme.danger }}>+{a.subida_pct.toFixed(1)}%</ThemedText>}
        />
      ))}
    </ListCard>
  );
}

function TabImpuestos() {
  const theme = useTheme();
  const [{ anio, trimestre }, setPeriodo] = useState(trimestreActual());
  const [descargando, setDescargando] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['analisis', 'iva-trimestre', anio, trimestre],
    queryFn: () => obtenerIvaTrimestre(anio, trimestre),
  });

  function cambiarTrimestre(delta: number) {
    let t = trimestre + delta;
    let a = anio;
    if (t < 1) { t = 4; a -= 1; }
    if (t > 4) { t = 1; a += 1; }
    setPeriodo({ anio: a, trimestre: t });
  }

  async function descargarTickets() {
    if (!data) return;
    setDescargando(true);
    try {
      const token = tokenStore.getAccessToken();
      const destino = new File(Paths.cache, `tickets-${data.anio}-T${data.trimestre}.zip`);
      const archivo = await File.downloadFileAsync(urlTicketsPeriodo(data.desde, data.hasta), destino, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        idempotent: true,
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri);
    } catch {
      Alert.alert('No se ha podido descargar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <View style={styles.selectorTrimestre}>
        <Pressable onPress={() => cambiarTrimestre(-1)} style={styles.flechaTrimestre}>
          <ThemedText type="default">‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">{anio} · T{trimestre}</ThemedText>
        <Pressable onPress={() => cambiarTrimestre(1)} style={styles.flechaTrimestre}>
          <ThemedText type="default">›</ThemedText>
        </Pressable>
      </View>

      {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
      {!!error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}

      {data && (
        <>
          <KpiRow>
            <KpiCard label="IVA repercutido" value={eur.format(data.iva_repercutido)} wide />
            <KpiCard label="IVA soportado" value={eur.format(data.iva_soportado)} />
            <KpiCard
              label="A pagar (estimado)"
              value={eur.format(data.iva_a_pagar_estimado)}
              wide
            />
          </KpiRow>

          <Ficha style={styles.fichaDesglose}>
            <FilaFicha etiqueta="Base imponible repercutida" valor={eur.format(data.base_imponible_repercutida)} />
            <FilaFicha etiqueta={`Documentos (B2B/Grand Folies)`} valor={String(data.documentos_repercutido)} />
            <FilaFicha etiqueta="Base imponible soportada" valor={eur.format(data.base_imponible_soportada)} />
            <FilaFicha etiqueta="Gastos con IVA leído" valor={String(data.gastos_con_iva_leido)} />
            <FilaFicha etiqueta="Gastos sin IVA leído" valor={String(data.gastos_sin_iva_leido)} last />
          </Ficha>

          {data.gastos_sin_iva_leido > 0 && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              ⚠ {data.gastos_sin_iva_leido} gasto(s) de este trimestre no tienen el IVA desglosado (el ticket no lo mostraba, o se metió a mano) -- el IVA soportado real puede ser mayor.
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            No sustituye a tu gestor: es una comprobación rápida con tus propios datos. Todavía no incluye la tienda online, solo B2B/Grand Folies y los tickets escaneados.
          </ThemedText>

          <Pressable
            onPress={descargarTickets}
            disabled={descargando}
            style={[styles.botonDescargarTickets, { backgroundColor: theme.backgroundElement, opacity: descargando ? 0.6 : 1 }]}>
            <ThemedText type="smallBold">{descargando ? 'Preparando…' : '📎 Descargar tickets del trimestre'}</ThemedText>
          </Pressable>
        </>
      )}
    </>
  );
}

function CampoNumero({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: string; onCambiar: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.campoNumero}>
      <ThemedText type="small" themeColor="textSecondary">{etiqueta}</ThemedText>
      <TextInput value={valor} onChangeText={onCambiar} keyboardType="decimal-pad" style={[styles.input, { color: theme.text, borderColor: theme.separator }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  centro: { marginTop: Spacing.five },
  selectorPeriodo: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  chipPeriodo: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  enlaceRango: { marginTop: Spacing.two },
  filaRango: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  inputRango: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  seccion: { marginTop: Spacing.two, marginBottom: Spacing.two, letterSpacing: 0.3 },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  filaCampos: { flexDirection: 'row', gap: Spacing.two },
  campoNumero: { flex: 1, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  botonGuardarChico: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  nota: { marginTop: -Spacing.one, marginBottom: Spacing.two, lineHeight: 18 },
  acordeon: { borderRadius: 16, marginBottom: Spacing.two, overflow: 'hidden' },
  acordeonCabecera: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, gap: Spacing.two },
  acordeonCuerpo: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  fichaDesglose: { marginBottom: Spacing.one },
  ingrediente: { lineHeight: 18 },
  selectorTrimestre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  flechaTrimestre: { paddingHorizontal: Spacing.two, paddingVertical: 4 },
  aviso: { lineHeight: 18, marginBottom: Spacing.two },
  botonDescargarTickets: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.one },
});
