import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { EscanerCamara } from '@/components/escaner-camara';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmarInventario,
  descartarInventario,
  escanearInventario,
  mensajeError,
  type BorradorEscaneo,
  type ResultadoConfirmarInventario,
} from '@/lib/api';

// Réplica de /panel/obrador (sub-sección Inventario) -- un solo botón "📷 Escanear",
// la IA de ninuma-agente decide sola si es ticket de compra o albarán propio. No hay
// edición línea a línea (tampoco la hay en el panel): se confirma tal cual o se
// vuelve a escanear si algo está mal.

type Paso = 'camara' | 'leyendo' | 'revisar' | 'confirmando' | 'hecho';

export function InventarioEscaner({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [paso, setPaso] = useState<Paso>('camara');
  const [borrador, setBorrador] = useState<BorradorEscaneo | null>(null);
  const [resultado, setResultado] = useState<ResultadoConfirmarInventario | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alHacerFoto(uri: string) {
    setPaso('leyendo');
    setError(null);
    try {
      setBorrador(await escanearInventario(uri));
      setPaso('revisar');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('camara');
    }
  }

  async function confirmar() {
    if (!borrador) return;
    setPaso('confirmando');
    setError(null);
    try {
      const res = await confirmarInventario(borrador.id);
      if (!res.ok) {
        setError(res.error ?? 'No se ha podido confirmar.');
        setPaso('revisar');
        return;
      }
      setResultado(res);
      setPaso('hecho');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('revisar');
    }
  }

  async function volverAEscanear() {
    if (borrador) {
      try {
        await descartarInventario(borrador.id);
      } catch {
        // no bloquea volver a escanear aunque falle el descarte
      }
    }
    setBorrador(null);
    setError(null);
    setPaso('camara');
  }

  if (paso === 'camara') return <EscanerCamara onFoto={alHacerFoto} onCancelar={onVolver} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Obrador
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Inventario
          </ThemedText>

          {paso === 'leyendo' && (
            <View style={styles.centro}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">Leyendo la foto...</ThemedText>
            </View>
          )}

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.aviso}>
              {error}
            </ThemedText>
          )}

          {paso === 'hecho' && resultado && (
            <View style={styles.centro}>
              <ThemedText type="default">
                ✅ {(resultado.sumadas?.length ?? 0)} producto(s) actualizados en Grocy.
              </ThemedText>
              {!!resultado.sin_emparejar?.length && (
                <ThemedText type="small" themeColor="danger" style={styles.aviso}>
                  ❌ No se han podido emparejar (no se han tocado): {resultado.sin_emparejar.join(', ')}
                </ThemedText>
              )}
              <BotonPrimario texto="Volver a Obrador" onPress={onVolver} />
            </View>
          )}

          {(paso === 'revisar' || paso === 'confirmando') && borrador && (
            <RevisionBorrador borrador={borrador} />
          )}
        </ScrollView>

        {(paso === 'revisar' || paso === 'confirmando') && (
          <View style={styles.pie}>
            <View style={styles.filaBotones}>
              <Pressable onPress={volverAEscanear} disabled={paso === 'confirmando'} style={[styles.botonRescan, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">🔄 Volver a escanear</ThemedText>
              </Pressable>
              <View style={styles.botonConfirmar}>
                <BotonPrimario texto="✅ Confirmar" onPress={confirmar} cargando={paso === 'confirmando'} />
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function RevisionBorrador({ borrador }: { borrador: BorradorEscaneo }) {
  if (borrador.tipo === 'ticket_compra') {
    const etiqueta = `Ticket de compra${borrador.proveedor ? ` · ${borrador.proveedor}` : ' · proveedor sin identificar'}`;
    return (
      <>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>{etiqueta.toUpperCase()}</ThemedText>
        {borrador.lineas.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">No he leído ninguna línea con claridad.</ThemedText>
        ) : (
          <ListCard>
            {borrador.lineas.map((l, i) => {
              const icono = !l.es_producto ? '➖' : l.product_id !== null ? '✅' : '❌';
              const nota = !l.es_producto
                ? 'gasto, no es stock'
                : l.product_id !== null
                  ? `se sumará a «${l.nombre_grocy ?? l.descripcion}»`
                  : 'no lo he podido emparejar, no se tocará';
              return (
                <ListRow
                  key={`${l.descripcion}-${i}`}
                  last={i === borrador.lineas.length - 1}
                  title={`${icono} ${l.descripcion}`}
                  subtitle={nota}
                  right={<ThemedText type="small" themeColor="textSecondary">×{l.cantidad}</ThemedText>}
                />
              );
            })}
          </ListCard>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.leyenda}>
          ✅ se sumará a inventario · ❌ no se ha podido emparejar (no se toca) · ➖ gasto, no es mercancía.
        </ThemedText>
      </>
    );
  }

  const etiqueta = `Tu albarán · ${borrador.cliente ?? 'cliente sin identificar'}`;
  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>{etiqueta.toUpperCase()}</ThemedText>
      {borrador.lineas.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">No he leído ninguna línea con claridad.</ThemedText>
      ) : (
        <ListCard>
          {borrador.lineas.map((l, i) => (
            <ListRow key={`${l.descripcion}-${i}`} last={i === borrador.lineas.length - 1} title={l.descripcion} right={<ThemedText type="small" themeColor="textSecondary">×{l.unidades}</ThemedText>} />
          ))}
        </ListCard>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.leyenda}>
        Esto es lo que he leído -- confirma o vuelve a escanear si algo está mal.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.one },
  titulo: { fontSize: 26, lineHeight: 31, marginBottom: Spacing.two },
  centro: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  aviso: { lineHeight: 20 },
  seccion: { marginBottom: Spacing.two, letterSpacing: 0.3 },
  leyenda: { marginTop: Spacing.two, lineHeight: 18 },
  pie: { paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset || Spacing.three, paddingTop: Spacing.two },
  filaBotones: { flexDirection: 'row', gap: Spacing.two },
  botonRescan: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  botonConfirmar: { flex: 1 },
});
