import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { login, mensajeError, verificarTotp } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Paso = 'credenciales' | 'totp';

export function LoginScreen() {
  const theme = useTheme();
  const { completarLogin } = useAuth();

  const [paso, setPaso] = useState<Paso>('credenciales');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tokenPendiente, setTokenPendiente] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviarCredenciales() {
    setError(null);
    setCargando(true);
    try {
      const resultado = await login(usuario.trim(), password);
      setTokenPendiente(resultado.token_pendiente);
      setTotpUri(resultado.configurando_totp ? (resultado.totp_uri ?? null) : null);
      setPaso('totp');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function enviarCodigo() {
    setError(null);
    setCargando(true);
    try {
      const resultado = await verificarTotp(tokenPendiente, codigo.trim(), Platform.OS);
      await completarLogin(resultado.access_token, resultado.refresh_token);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={{ color: theme.accent }}>
          NINUMAPP
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitulo}>
          {paso === 'credenciales' ? 'Inicia sesión' : 'Código de verificación'}
        </ThemedText>

        {paso === 'credenciales' ? (
          <ThemedView style={styles.form}>
            <TextInput
              placeholder="Usuario"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={usuario}
              onChangeText={setUsuario}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              placeholder="Contraseña"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              onSubmitEditing={enviarCredenciales}
            />
            <BotonPrincipal onPress={enviarCredenciales} cargando={cargando} disabled={!usuario || !password} texto="Entrar" />
          </ThemedView>
        ) : (
          <ThemedView style={styles.form}>
            {totpUri && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.avisoTotp}>
                Primera vez: configura tu app de autenticación (Google Authenticator, Authy...) con este código, y luego
                escribe el código de 6 dígitos que te muestre.{'\n\n'}
                Clave manual: {extraerSecreto(totpUri)}
              </ThemedText>
            )}
            <TextInput
              placeholder="Código de 6 dígitos"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              value={codigo}
              onChangeText={setCodigo}
              style={[styles.input, styles.inputCodigo, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              onSubmitEditing={enviarCodigo}
            />
            <BotonPrincipal onPress={enviarCodigo} cargando={cargando} disabled={codigo.length !== 6} texto="Verificar" />
          </ThemedView>
        )}

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function extraerSecreto(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? uri;
  } catch {
    return uri;
  }
}

function BotonPrincipal({
  onPress,
  cargando,
  disabled,
  texto,
}: {
  onPress: () => void;
  cargando: boolean;
  disabled: boolean;
  texto: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || cargando}
      style={[styles.boton, { backgroundColor: theme.accent, opacity: disabled || cargando ? 0.5 : 1 }]}>
      {cargando ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.botonTexto}>{texto}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.two },
  subtitulo: { marginBottom: Spacing.four },
  form: { gap: Spacing.three },
  input: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  inputCodigo: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  avisoTotp: { lineHeight: 20 },
  boton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { marginTop: Spacing.two },
});
