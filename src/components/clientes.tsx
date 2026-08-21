import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar, ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { actualizarCliente, crearCliente, mensajeError, obtenerClientes, type Cliente, type ClienteBody } from '@/lib/api';

// No es una ruta -- ver obrador.tsx: mismo motivo (el layout raíz no tiene Stack
// sobre las pestañas). Vista dentro de la propia pestaña Pedidos.
type Vista = { tipo: 'lista' } | { tipo: 'form'; cliente: Cliente | null };

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

export function Clientes({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const { data, isLoading, error } = useQuery({ queryKey: ['clientes'], queryFn: obtenerClientes });

  if (vista.tipo === 'form') {
    return <ClienteFormulario cliente={vista.cliente} onVolver={() => setVista({ tipo: 'lista' })} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Pedidos
            </ThemedText>
          </Pressable>
          <View style={styles.filaTitulo}>
            <ThemedText type="title" style={styles.titulo}>
              Clientes
            </ThemedText>
            <Pressable onPress={() => setVista({ tipo: 'form', cliente: null })}>
              <ThemedText type="link" style={{ color: theme.accent }}>
                ＋ Nuevo
              </ThemedText>
            </Pressable>
          </View>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {mensajeError(error)}
            </ThemedText>
          )}
          {data?.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Todavía no hay clientes.
            </ThemedText>
          )}

          {!!data?.length && (
            <ListCard>
              {data.map((c, i) => (
                <ListRow
                  key={c.id}
                  last={i === data.length - 1}
                  onPress={() => setVista({ tipo: 'form', cliente: c })}
                  left={<Avatar iniciales={iniciales(c.nombre) || '·'} />}
                  title={c.nombre}
                  subtitle={[c.empresa, c.telefono].filter(Boolean).join(' · ') || null}
                />
              ))}
            </ListCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ClienteFormulario({ cliente, onVolver }: { cliente: Cliente | null; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [campos, setCampos] = useState<ClienteBody>({
    nombre: cliente?.nombre ?? '',
    empresa: cliente?.empresa ?? '',
    telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    nif: cliente?.nif ?? '',
    notas: cliente?.notas ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!campos.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (cliente) await actualizarCliente(cliente.id, campos);
      else await crearCliente(campos);
      await queryClient.invalidateQueries({ queryKey: ['clientes'] });
      onVolver();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Clientes
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {cliente ? 'Editar cliente' : 'Nuevo cliente'}
          </ThemedText>

          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <Campo etiqueta="Nombre *" valor={campos.nombre} onCambiar={(v) => setCampos({ ...campos, nombre: v })} />
            <Campo etiqueta="Empresa" valor={campos.empresa ?? ''} onCambiar={(v) => setCampos({ ...campos, empresa: v })} />
            <Campo etiqueta="Teléfono" valor={campos.telefono ?? ''} onCambiar={(v) => setCampos({ ...campos, telefono: v })} teclado="phone-pad" />
            <Campo etiqueta="Email" valor={campos.email ?? ''} onCambiar={(v) => setCampos({ ...campos, email: v })} teclado="email-address" />
            <Campo etiqueta="NIF" valor={campos.nif ?? ''} onCambiar={(v) => setCampos({ ...campos, nif: v })} />
            <Campo etiqueta="Notas" valor={campos.notas ?? ''} onCambiar={(v) => setCampos({ ...campos, notas: v })} multilinea last />
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}

          <BotonPrimario texto="Guardar" onPress={guardar} cargando={guardando} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambiar,
  teclado,
  multilinea,
  last,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  teclado?: 'phone-pad' | 'email-address';
  multilinea?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.campo, !last && { borderBottomWidth: 1, borderBottomColor: theme.separator }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        keyboardType={teclado}
        multiline={multilinea}
        style={[styles.input, multilinea && styles.inputMultilinea, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  centro: { marginTop: Spacing.five },
  formCard: { borderRadius: 16, paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  campo: { paddingVertical: Spacing.two, gap: 2 },
  input: { fontSize: 16, paddingVertical: 4 },
  inputMultilinea: { minHeight: 70, textAlignVertical: 'top' },
});
