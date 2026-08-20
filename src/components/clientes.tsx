import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { actualizarCliente, crearCliente, mensajeError, obtenerClientes, type Cliente, type ClienteBody } from '@/lib/api';

// No es una ruta -- ver obrador.tsx: mismo motivo (el layout raíz no tiene Stack
// sobre las pestañas). Vista dentro de la propia pestaña Pedidos.
type Vista = { tipo: 'lista' } | { tipo: 'form'; cliente: Cliente | null };

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
        <ThemedView style={styles.cabecera}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Pedidos
            </ThemedText>
          </Pressable>
          <ThemedView style={styles.filaTitulo}>
            <ThemedText type="subtitle" style={{ color: theme.accent }}>
              Clientes
            </ThemedText>
            <Pressable onPress={() => setVista({ tipo: 'form', cliente: null })}>
              <ThemedText type="link" style={{ color: theme.accent }}>
                ＋ Nuevo
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.aviso}>
            {mensajeError(error)}
          </ThemedText>
        )}
        {data?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.aviso}>
            Todavía no hay clientes.
          </ThemedText>
        )}

        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Pressable onPress={() => setVista({ tipo: 'form', cliente: item })}>
              <ThemedView type="backgroundElement" style={styles.tarjeta}>
                <ThemedText type="default">{item.nombre}</ThemedText>
                {(item.empresa || item.telefono) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[item.empresa, item.telefono].filter(Boolean).join(' · ')}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          )}
        />
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
        <ScrollView contentContainerStyle={styles.formulario}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Clientes
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={{ color: theme.accent }}>
            {cliente ? 'Editar cliente' : 'Nuevo cliente'}
          </ThemedText>

          <Campo etiqueta="Nombre *" valor={campos.nombre} onCambiar={(v) => setCampos({ ...campos, nombre: v })} />
          <Campo etiqueta="Empresa" valor={campos.empresa ?? ''} onCambiar={(v) => setCampos({ ...campos, empresa: v })} />
          <Campo etiqueta="Teléfono" valor={campos.telefono ?? ''} onCambiar={(v) => setCampos({ ...campos, telefono: v })} teclado="phone-pad" />
          <Campo etiqueta="Email" valor={campos.email ?? ''} onCambiar={(v) => setCampos({ ...campos, email: v })} teclado="email-address" />
          <Campo etiqueta="NIF" valor={campos.nif ?? ''} onCambiar={(v) => setCampos({ ...campos, nif: v })} />
          <Campo etiqueta="Notas" valor={campos.notas ?? ''} onCambiar={(v) => setCampos({ ...campos, notas: v })} multilinea />

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
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  teclado?: 'phone-pad' | 'email-address';
  multilinea?: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.campo}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        keyboardType={teclado}
        multiline={multilinea}
        style={[styles.input, multilinea && styles.inputMultilinea, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, gap: Spacing.two, paddingBottom: BottomTabInset },
  cabecera: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  centro: { marginTop: Spacing.five },
  aviso: { lineHeight: 20, paddingHorizontal: Spacing.four },
  lista: { padding: Spacing.four, gap: Spacing.three },
  tarjeta: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  formulario: { padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  campo: { gap: Spacing.one },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  inputMultilinea: { minHeight: 80, textAlignVertical: 'top' },
});
