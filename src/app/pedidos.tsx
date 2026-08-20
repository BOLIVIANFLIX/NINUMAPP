import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Clientes } from '@/components/clientes';
import { PedidoPropioFormulario } from '@/components/pedido-propio-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mensajeError, obtenerPedidos, obtenerPedidosPropios, type Pedido, type PedidoPropio } from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });

const ETIQUETAS_KIND: Record<string, string> = { b2b: 'B2B', encargo: 'Particular' };
const ETIQUETAS_ESTADO_PROPIO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  cobrado: 'Cobrado',
};

type Vista = { tipo: 'principal' } | { tipo: 'clientes' } | { tipo: 'form-pedido'; pedido: PedidoPropio | null };

export default function PedidosScreen() {
  const theme = useTheme();
  const [vista, setVista] = useState<Vista>({ tipo: 'principal' });

  const webQuery = useQuery({ queryKey: ['pedidos'], queryFn: obtenerPedidos });
  const propiosQuery = useQuery({ queryKey: ['pedidos-propios'], queryFn: obtenerPedidosPropios });

  if (vista.tipo === 'clientes') return <Clientes onVolver={() => setVista({ tipo: 'principal' })} />;
  if (vista.tipo === 'form-pedido') {
    return <PedidoPropioFormulario pedido={vista.pedido} onVolver={() => setVista({ tipo: 'principal' })} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedView style={styles.filaTitulo}>
            <ThemedText type="subtitle" style={{ color: theme.accent }}>
              Pedidos
            </ThemedText>
            <Pressable onPress={() => setVista({ tipo: 'clientes' })}>
              <ThemedText type="link" style={{ color: theme.accent }}>
                👤 Clientes
              </ThemedText>
            </Pressable>
          </ThemedView>

          <Seccion titulo="Confirmados (web)">
            {webQuery.isLoading && <ActivityIndicator color={theme.accent} />}
            {webQuery.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(webQuery.error)}
              </ThemedText>
            )}
            {webQuery.data?.aviso && (
              <ThemedText type="small" themeColor="textSecondary">
                ℹ️ {webQuery.data.aviso}
              </ThemedText>
            )}
            {webQuery.data?.conectado && webQuery.data.pedidos.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No hay pedidos confirmados todavía.
              </ThemedText>
            )}
            {webQuery.data?.pedidos.map((p) => <TarjetaPedidoWeb key={p.id} pedido={p} />)}
          </Seccion>

          <Seccion
            titulo="Mis pedidos"
            accion={
              <Pressable onPress={() => setVista({ tipo: 'form-pedido', pedido: null })}>
                <ThemedText type="link" style={{ color: theme.accent }}>
                  ＋ Nuevo
                </ThemedText>
              </Pressable>
            }>
            <ThemedText type="small" themeColor="textSecondary">
              Pedidos creados a mano en NINUMAPP -- no aparecen en la web pública, es un registro propio.
            </ThemedText>
            {propiosQuery.isLoading && <ActivityIndicator color={theme.accent} />}
            {propiosQuery.error && (
              <ThemedText type="small" themeColor="danger">
                {mensajeError(propiosQuery.error)}
              </ThemedText>
            )}
            {propiosQuery.data?.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Todavía no has creado ningún pedido propio.
              </ThemedText>
            )}
            {propiosQuery.data?.map((p) => (
              <Pressable key={p.id} onPress={() => setVista({ tipo: 'form-pedido', pedido: p })}>
                <TarjetaPedidoPropio pedido={p} />
              </Pressable>
            ))}
          </Seccion>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Seccion({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.seccion}>
      <ThemedView style={styles.filaTitulo}>
        <ThemedText type="default" style={styles.tituloSeccion}>
          {titulo}
        </ThemedText>
        {accion}
      </ThemedView>
      {children}
    </ThemedView>
  );
}

function TarjetaPedidoWeb({ pedido }: { pedido: Pedido }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">{pedido.cliente}</ThemedText>
        <ThemedText type="default">{eur.format(pedido.total_cents / 100)}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="small" themeColor="textSecondary">
          {ETIQUETAS_KIND[pedido.kind] ?? pedido.kind} · {pedido.status}
          {pedido.locator ? ` · ${pedido.locator}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fecha.format(new Date(pedido.recogida_fecha ?? pedido.creado_en))}
        </ThemedText>
      </ThemedView>
      {pedido.descripcion && (
        <ThemedText type="small" themeColor="textSecondary">
          {pedido.descripcion}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function TarjetaPedidoPropio({ pedido }: { pedido: PedidoPropio }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tarjeta}>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="default">{pedido.cliente_nombre}</ThemedText>
        <ThemedText type="default">{eur.format(pedido.total_cents / 100)}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.filaSuperior}>
        <ThemedText type="small" themeColor="textSecondary">
          {ETIQUETAS_ESTADO_PROPIO[pedido.estado] ?? pedido.estado}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fecha.format(new Date(pedido.creado_en))}
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {pedido.descripcion}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.four },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seccion: { gap: Spacing.two },
  tituloSeccion: { fontWeight: '600' },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  filaSuperior: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
