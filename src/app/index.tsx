import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbaranWizard } from '@/components/albaran-wizard';
import { AnalisisFinanciero } from '@/components/analisis-financiero';
import { FacturasPendientesCobro } from '@/components/facturas-pendientes-cobro';
import { IngresosGastos } from '@/components/ingresos-gastos';
import { PreciosTienda } from '@/components/precios-tienda';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientCard, KpiCard, KpiRow, ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { UsuariosPanel } from '@/components/usuarios-panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerDocumentosRecientes, obtenerResumen } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaHoy = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });
const fechaLargaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

type Vista = 'inicio' | 'nuevo-albaran' | 'analisis' | 'ingresos' | 'precios-tienda' | 'usuarios' | 'facturas-cobro';

// Réplica de panel._seccion_inicio: mismas 3 tarjetas, próxima entrega, acumulado
// sin facturar, accesos rápidos reales (generar albarán/análisis/gastos) y Gestión
// para lo que no tiene ya un atajo propio.
export default function InicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { cerrarSesion } = useAuth();
  const [vista, setVista] = useState<Vista>('inicio');

  // Al salir de la pestaña siempre se vuelve a la pantalla principal -- nunca se
  // queda "congelada" en el submenú donde estaba (las pestañas de abajo no se
  // desmontan al cambiar entre ellas, así que hay que resetear a mano).
  useFocusEffect(
    useCallback(() => {
      return () => setVista('inicio');
    }, []),
  );

  const { data: resumen, error, isFetching, refetch } = useQuery({
    queryKey: ['resumen'],
    queryFn: obtenerResumen,
  });
  const documentos = useQuery({ queryKey: ['documentos-recientes'], queryFn: obtenerDocumentosRecientes });

  const hoy = fechaHoy.format(new Date());
  const f = resumen?.financiero;

  if (vista === 'nuevo-albaran') {
    return <AlbaranWizard onVolver={() => setVista('inicio')} />;
  }
  if (vista === 'analisis') return <AnalisisFinanciero onVolver={() => setVista('inicio')} />;
  if (vista === 'ingresos') return <IngresosGastos onVolver={() => setVista('inicio')} />;
  if (vista === 'precios-tienda') return <PreciosTienda onVolver={() => setVista('inicio')} />;
  if (vista === 'usuarios') return <UsuariosPanel onVolver={() => setVista('inicio')} />;
  if (vista === 'facturas-cobro') return <FacturasPendientesCobro onVolver={() => setVista('inicio')} />;

  const proxima = f?.proxima_entrega;
  const sub2Proxima = proxima
    ? [
        fechaLargaCorta.format(new Date(proxima.fecha)),
        proxima.descripcion?.replace(/\n/g, ' · ') || null,
        proxima.mas_ese_dia ? `+${proxima.mas_ese_dia} más ese día` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={theme.accent} />}>
          <View style={styles.cabecera}>
            <View>
              <ThemedText type="title" style={styles.saludo}>
                Hola, {resumen?.usuario ?? '...'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.subFecha}>
                {hoy.charAt(0).toUpperCase() + hoy.slice(1)}
              </ThemedText>
            </View>
            <Pressable onPress={cerrarSesion}>
              <ThemedText type="link" themeColor="textSecondary">
                Cerrar sesión
              </ThemedText>
            </Pressable>
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {mensajeError(error)}
            </ThemedText>
          )}

          {f && (
            <KpiRow>
              <Pressable style={styles.kpiPress} onPress={() => setVista('ingresos')}>
                <KpiCard label={`Ingresos sin IVA · ${hoy.split(' ').pop()}`} value={eur.format(f.ingresos_sin_iva_cobrados_mes)} wide />
              </Pressable>
              <Pressable style={styles.kpiPress} onPress={() => setVista('facturas-cobro')}>
                <KpiCard label="Facturas pendientes de cobro" value={eur.format(f.facturas_pendientes_cobro.total_eur)} delta={`${f.facturas_pendientes_cobro.documentos} documento(s)`} />
              </Pressable>
              <Pressable style={styles.kpiPress} onPress={() => router.push('/avisos')}>
                <KpiCard label="Contactos sin resolver" value={String(f.contactos_sin_resolver)} />
              </Pressable>
            </KpiRow>
          )}

          {resumen?.aviso && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
              ℹ️ {resumen.aviso}
            </ThemedText>
          )}

          {proxima && (
            <View style={styles.tarjetaProxima}>
              <GradientCard title={`Próxima entrega · ${proxima.cliente}`} subtitle={sub2Proxima} boton="Ver" onPress={() => router.push('/calendario')} />
            </View>
          )}

          {f && (f.acumulado_sin_facturar.mensual.albaranes > 0 || f.acumulado_sin_facturar.directa.listas_para_emitir > 0) && (
            <Pressable onPress={() => router.push('/pedidos')}>
              <ListCard style={styles.tarjetaAcumulado}>
                {f.acumulado_sin_facturar.mensual.albaranes > 0 && (
                  <ListRow
                    last={f.acumulado_sin_facturar.directa.listas_para_emitir === 0}
                    left={<Dot color="info">Mensual</Dot>}
                    title="Acumulado sin facturar (con IVA)"
                    subtitle={`${f.acumulado_sin_facturar.mensual.clientes.join(', ')} · ${f.acumulado_sin_facturar.mensual.albaranes} albarán(es)`}
                    right={<ThemedText type="smallBold">{eur.format(f.acumulado_sin_facturar.mensual.total_eur)}</ThemedText>}
                  />
                )}
                {f.acumulado_sin_facturar.directa.listas_para_emitir > 0 && (
                  <ListRow
                    last
                    left={<Dot color="warning">Directa</Dot>}
                    title="Facturas directas pendientes"
                    subtitle={`${f.acumulado_sin_facturar.directa.listas_para_emitir} lista(s) para emitir`}
                    right={<ThemedText type="smallBold">{eur.format(f.acumulado_sin_facturar.directa.total_eur)}</ThemedText>}
                  />
                )}
              </ListCard>
            </Pressable>
          )}

          <SectionLabel>Accesos rápidos</SectionLabel>
          <View style={styles.quickRow}>
            <Pressable onPress={() => setVista('nuevo-albaran')} style={[styles.quick, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.quickIco, { backgroundColor: theme.accentSoft }]}>
                <ThemedText style={{ fontSize: 17 }}>➕</ThemedText>
              </View>
              <ThemedText type="small" style={styles.quickTxt}>
                Generar albarán
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setVista('analisis')} style={[styles.quick, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.quickIco, { backgroundColor: theme.accentSoft }]}>
                <ThemedText style={{ fontSize: 17 }}>📊</ThemedText>
                {f?.hay_aviso_analisis && <View style={[styles.puntoAviso, { backgroundColor: theme.danger }]} />}
              </View>
              <ThemedText type="small" style={styles.quickTxt}>
                Análisis financiero
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setVista('ingresos')} style={[styles.quick, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.quickIco, { backgroundColor: theme.accentSoft }]}>
                <ThemedText style={{ fontSize: 17 }}>💸</ThemedText>
              </View>
              <ThemedText type="small" style={styles.quickTxt}>
                Gastos
              </ThemedText>
              {f && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.quickTxt2}>
                  {eur.format(f.gastos_mes)}
                </ThemedText>
              )}
            </Pressable>
          </View>

          <SectionLabel>Gestión</SectionLabel>
          <ListCard>
            <ListRow onPress={() => setVista('precios-tienda')} title="🏷️ Precios de la tienda" subtitle="Precio público, se refleja en la web" />
            <ListRow last onPress={() => setVista('usuarios')} title="👤 Gestionar usuarios" subtitle="Cuentas del panel" />
          </ListCard>

          {!!documentos.data?.documentos.length && (
            <>
              <SectionLabel>Documentos recientes</SectionLabel>
              <ListCard>
                {documentos.data.documentos.map((d, i) => (
                  <ListRow
                    key={d.numero}
                    last={i === documentos.data!.documentos.length - 1}
                    title={`Albarán ${d.numero}`}
                    subtitle={d.cliente}
                    right={
                      <ThemedText type="small" themeColor="textSecondary">
                        {fechaCorta.format(new Date(d.creado_en))}
                      </ThemedText>
                    }
                  />
                ))}
              </ListCard>
              <Pressable onPress={() => router.push('/pedidos')}>
                <ThemedText type="link" style={[styles.enlaceTodos, { color: theme.accent }]}>
                  Ver todos los documentos ›
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Dot({ children, color }: { children: string; color: 'info' | 'warning' }) {
  const theme = useTheme();
  const bg = color === 'info' ? theme.infoSoft : theme.warningSoft;
  const fg = color === 'info' ? theme.info : theme.warningText;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText type="small" style={{ color: fg, fontWeight: '700', fontSize: 11 }}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.four },
  saludo: { fontSize: 26, lineHeight: 31 },
  subFecha: { marginTop: 2, textTransform: 'capitalize' },
  aviso: { lineHeight: 20, marginBottom: Spacing.three },
  kpiPress: { flexGrow: 1, flexBasis: '47%' },
  tarjetaProxima: { marginTop: Spacing.three },
  tarjetaAcumulado: { marginTop: Spacing.three },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  quickRow: { flexDirection: 'row', gap: Spacing.two },
  quick: { flex: 1, borderRadius: 16, paddingVertical: Spacing.three, paddingHorizontal: Spacing.one, alignItems: 'center' },
  quickIco: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  quickTxt: { fontWeight: '600', textAlign: 'center' },
  quickTxt2: { marginTop: 2 },
  puntoAviso: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5 },
  enlaceTodos: { marginTop: Spacing.two },
});
