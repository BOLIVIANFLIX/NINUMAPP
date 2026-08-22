/** Gestión de usuarios del panel de ninuma-agente (ninuma-bot.tunga.es/panel) -- no
 * es el login de NINUMAPP, son las cuentas de otro sitio (mismo backend real que
 * panel._seccion_usuarios). Accesible desde Avisos, igual que en el panel. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cambiarPasswordUsuarioPanel,
  cerrarSesionUsuarioPanel,
  crearUsuarioPanel,
  eliminarUsuarioPanel,
  mensajeError,
  obtenerUsuariosPanel,
} from '@/lib/api';

const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

export function UsuariosPanel({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const usuarios = useQuery({ queryKey: ['usuarios-panel'], queryFn: obtenerUsuariosPanel });

  const [usuarioNuevo, setUsuarioNuevo] = useState('');
  const [passwordNuevo, setPasswordNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usuarioEditando, setUsuarioEditando] = useState<string | null>(null);
  const [passwordCambio, setPasswordCambio] = useState('');
  const [cambiando, setCambiando] = useState(false);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['usuarios-panel'] });
  }

  async function crear() {
    if (!usuarioNuevo.trim() || !passwordNuevo) {
      setError('Pon usuario y contraseña.');
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const resp = await crearUsuarioPanel(usuarioNuevo.trim(), passwordNuevo);
      if (!resp.ok) {
        setError(resp.error ?? 'No se ha podido crear.');
        return;
      }
      setUsuarioNuevo('');
      setPasswordNuevo('');
      refrescar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCreando(false);
    }
  }

  function pedirEliminar(usuario: string) {
    Alert.alert('Eliminar usuario', `Se eliminará la cuenta "${usuario}" del panel. No se puede deshacer. ¿Seguro?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const resp = await eliminarUsuarioPanel(usuario);
            if (!resp.ok) {
              Alert.alert('Error', resp.error ?? 'No se ha podido eliminar.');
              return;
            }
            refrescar();
          } catch (err) {
            Alert.alert('Error', mensajeError(err));
          }
        },
      },
    ]);
  }

  function pedirCerrarSesion(usuario: string) {
    Alert.alert('Cerrar sesión', `"${usuario}" tendrá que volver a iniciar sesión en el panel. ¿Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        onPress: async () => {
          try {
            await cerrarSesionUsuarioPanel(usuario);
          } catch (err) {
            Alert.alert('Error', mensajeError(err));
          }
        },
      },
    ]);
  }

  async function cambiarPassword() {
    if (!usuarioEditando || !passwordCambio) return;
    setCambiando(true);
    setError(null);
    try {
      const resp = await cambiarPasswordUsuarioPanel(usuarioEditando, passwordCambio);
      if (!resp.ok) {
        setError(resp.error ?? 'No se ha podido cambiar.');
        return;
      }
      setUsuarioEditando(null);
      setPasswordCambio('');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCambiando(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Avisos
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Usuarios del panel
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Cuentas de ninuma-bot.tunga.es/panel -- no es el login de NINUMAPP.
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {usuarios.isLoading && <ActivityIndicator color={theme.accent} />}
          {usuarios.data?.aviso && (
            <ThemedText type="small" themeColor="textSecondary">
              ℹ️ {usuarios.data.aviso}
            </ThemedText>
          )}
          {!!usuarios.data?.usuarios.length && (
            <ListCard>
              {usuarios.data.usuarios.map((u, i) => (
                <View key={u.usuario} style={i < usuarios.data!.usuarios.length - 1 ? [styles.filaUsuario, { borderBottomWidth: 1, borderBottomColor: theme.separator }] : styles.filaUsuario}>
                  <ListRow
                    last
                    title={u.usuario}
                    subtitle={`Creado ${fecha.format(new Date(u.creado_en))} · ${u.totp_activo ? '2FA activo' : 'sin 2FA configurar'}`}
                  />
                  <View style={styles.accionesFila}>
                    <Pressable onPress={() => setUsuarioEditando(usuarioEditando === u.usuario ? null : u.usuario)}>
                      <ThemedText type="small" style={{ color: theme.accent }}>
                        Cambiar contraseña
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => pedirCerrarSesion(u.usuario)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Cerrar sesión
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => pedirEliminar(u.usuario)}>
                      <ThemedText type="small" themeColor="danger">
                        Eliminar
                      </ThemedText>
                    </Pressable>
                  </View>
                  {usuarioEditando === u.usuario && (
                    <View style={styles.formCambio}>
                      <TextInput
                        value={passwordCambio}
                        onChangeText={setPasswordCambio}
                        placeholder="Nueva contraseña (mín. 8, letras y números)"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
                      />
                      <BotonPrimario texto="Guardar" onPress={cambiarPassword} cargando={cambiando} />
                    </View>
                  )}
                </View>
              ))}
            </ListCard>
          )}

          <SectionLabel>Crear usuario nuevo</SectionLabel>
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={usuarioNuevo}
              onChangeText={setUsuarioNuevo}
              placeholder="usuario"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: theme.text }]}
            />
            <TextInput
              value={passwordNuevo}
              onChangeText={setPasswordNuevo}
              placeholder="contraseña (mín. 8, letras y números)"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[styles.input, { color: theme.text }]}
            />
          </View>
          <View style={styles.botonCrear}>
            <BotonPrimario texto="＋ Crear usuario" onPress={crear} cargando={creando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  nota: { marginBottom: Spacing.three, lineHeight: 18 },
  error: { lineHeight: 20, marginBottom: Spacing.two },
  filaUsuario: { paddingBottom: Spacing.two },
  accionesFila: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  formCambio: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  botonCrear: { marginTop: Spacing.three },
});
