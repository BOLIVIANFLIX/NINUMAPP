import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { SelectorFechaCalendario } from '@/components/selector-fecha-calendario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ficha, FilaFicha, Pill, type PillColor } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { editarSolicitud, emailAsignarDia, mensajeError, type EncargoPendiente, type SolicitudPendiente } from '@/lib/api';

/** Decodifica entidades HTML sueltas ("&#39;", "&amp;"...) que llegan tal cual en la
 * descripción de algunos correos (p.ej. las notificaciones nativas de Formspree,
 * ver hallazgo 2026-08-24) -- no es HTML de verdad, así que basta con las entidades
 * más comunes, no hace falta un parser completo. */
function decodificarEntidadesHtml(texto: string): string {
  return texto
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, cod) => String.fromCharCode(Number(cod)));
}

const ETIQUETAS_CATEGORIA: Record<string, string> = {
  encargo: 'Encargo', duda: 'Duda', queja: 'Queja', proveedor: 'Proveedor', otro: 'Otro',
};
// Categoría real de una solicitud del formulario de contacto (Ariadna, 2026-08-27:
// "información sobre edición"/"información general" no son pedidos pero podrían
// pasar a serlo, y viceversa -- quiere poder reasignar la categoría desde la app).
// Las 4 primeras vienen ya puestas por ContactoForm.astro; "reunion" no existe en
// ningún formulario, solo se asigna aquí. Un color de Pill por categoría, para
// distinguirlas de un vistazo en la lista de Avisos.
export const CATEGORIAS_CONTACTO: Record<string, { texto: string; color: PillColor }> = {
  encargo: { texto: 'Encargo', color: 'warning' },
  b2b: { texto: 'Colaboración B2B', color: 'info' },
  edicion: { texto: 'Info. edición especial', color: 'accent' },
  informacion: { texto: 'Info. general', color: 'success' },
  reunion: { texto: 'Reunión', color: 'danger' },
};

// Réplica de /panel/avisos/email/{id} -- ficha + "Asignar un día" que crea un pedido
// real en la web (ninuma_web_client.crear_pedido) vía el bridge de ninuma-agente.
export function AsuntoEmail({ encargo, onVolver }: { encargo: EncargoPendiente; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState(encargo.resumen ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar() {
    if (!fecha || !descripcion.trim()) {
      setError('Falta la fecha o la descripción.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await emailAsignarDia(encargo.id, fecha, descripcion.trim());
      await queryClient.invalidateQueries({ queryKey: ['avisos-pendientes'] });
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
            <ThemedText type="link" themeColor="textSecondary">← Avisos</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {encargo.cliente || 'Sin nombre'}
          </ThemedText>

          <Ficha style={styles.ficha}>
            <FilaFicha etiqueta="Categoría" valor={ETIQUETAS_CATEGORIA[encargo.categoria] ?? encargo.categoria} />
            <FilaFicha etiqueta="Resumen" valor={encargo.resumen || '—'} />
            <FilaFicha etiqueta="Fecha mencionada" valor={encargo.fecha_mencionada || '—'} last={!encargo.urgente} />
            {encargo.urgente && <FilaFicha etiqueta="⚠️ Urgente" valor="" last />}
          </Ficha>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
            ASIGNAR UN DÍA (CREA UN PEDIDO DE PARTICULAR EN LA WEB)
          </ThemedText>
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={fecha}
              onChangeText={setFecha}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="¿Qué lleva el pedido?"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, styles.inputMultilinea, { color: theme.text, borderColor: theme.separator }]}
            />
          </View>

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="📅 Asignar día y crear pedido" onPress={asignar} cargando={guardando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Solicitud real (Supabase, kind='encargo') sin confirmar todavía -- a diferencia de
// AsuntoEmail (que crea un pedido nuevo desde el respaldo local de ninuma-agente),
// aquí el pedido ya existe en la web; solo falta revisar y confirmar su ficha.
// Ariadna, 2026-08-24: esta lista antes leía de un respaldo local casi siempre vacío
// (el camino normal ya crea el pedido directo en la web), así que el badge contaba
// bien pero la lista no mostraba nada -- ver services/avisos.py. Misma edición de
// ficha (nombre, teléfono, NIF/CIF, precio, empresa/particular, fecha) que ya existe
// por Telegram (menú "Cambiar algo"), con calendario en vez de escribir la fecha.
export function SolicitudDetalle({ solicitud, onVolver }: { solicitud: SolicitudPendiente; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const yaPagado = solicitud.payment_status === 'pagado';
  const [fecha, setFecha] = useState(solicitud.recogida_fecha ?? '');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [nombre, setNombre] = useState(solicitud.cliente === 'Sin nombre' ? '' : solicitud.cliente);
  const [telefono, setTelefono] = useState(solicitud.guest_telefono ?? '');
  const [nif, setNif] = useState(solicitud.nif ?? '');
  const [esEmpresa, setEsEmpresa] = useState(solicitud.es_empresa ?? false);
  const [precio, setPrecio] = useState(solicitud.total_cents != null ? (solicitud.total_cents / 100).toFixed(2) : '');
  const [categoria, setCategoria] = useState(solicitud.tipo_contacto ?? 'encargo');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarFicha() {
    if (!fecha) {
      setError('Falta la fecha.');
      return;
    }
    // Ariadna, 2026-08-25: "el precio no debería poder editarlo ya que es algo ya
    // pagado" -- si el pedido ya está cobrado (Stripe), lo cobrado es lo cobrado;
    // tocar total_cents aquí no corrige ningún cargo real, solo desincroniza el
    // registro frente a lo que de verdad se pagó. Editable solo mientras aún no se
    // ha cobrado (encargo pendiente de pago).
    const precioNum = !yaPagado && precio.trim() ? Number(precio.replace(',', '.')) : null;
    if (!yaPagado && precio.trim() && Number.isNaN(precioNum)) {
      setError('El precio no es un número válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await editarSolicitud(solicitud.id, {
        fecha,
        ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        ...(esEmpresa && nif.trim() ? { nif: nif.trim() } : {}),
        es_empresa: esEmpresa,
        ...(precioNum != null ? { precio_cents: Math.round(precioNum * 100) } : {}),
        ...(categoria !== (solicitud.tipo_contacto ?? 'encargo') ? { tipo_contacto: categoria } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['avisos'] });
      await queryClient.invalidateQueries({ queryKey: ['resumen'] });
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
            <ThemedText type="link" themeColor="textSecondary">← Avisos</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {solicitud.cliente || 'Sin nombre'}
          </ThemedText>

          <Ficha style={styles.ficha}>
            {solicitud.descripcion && (
              <FilaFicha etiqueta="Descripción" valor={decodificarEntidadesHtml(solicitud.descripcion)} multilinea />
            )}
            {/* Mismos datos que ya muestra el aviso de Telegram (nombre/email/
                teléfono de quien pagó de verdad) -- Ariadna, 2026-08-25. Solo lectura
                aquí, igual que en el bot: no hay forma de editar el email ni ahí. */}
            {solicitud.guest_email && <FilaFicha etiqueta="Email" valor={solicitud.guest_email} />}
            <FilaFicha
              etiqueta="Fecha solicitada"
              valor={solicitud.recogida_fecha ? new Date(`${solicitud.recogida_fecha}T00:00:00`).toLocaleDateString('es-ES') : 'No la ha indicado el cliente'}
            />
            <FilaFicha etiqueta="Pago" valor={solicitud.payment_status === 'pagado' ? '✅ Ya pagado' : 'Pendiente de pago'} />
            <FilaFicha etiqueta="Recibido" valor={new Date(solicitud.creado_en).toLocaleDateString('es-ES')} last />
          </Ficha>
          <ThemedText type="small" themeColor="textSecondary" style={styles.nota}>
            Al confirmar la ficha se guarda directamente en la web y la fecha aparece en el calendario compartido.
          </ThemedText>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>CATEGORÍA</ThemedText>
          <View style={styles.chipsFila}>
            {Object.entries(CATEGORIAS_CONTACTO).map(([valor, { texto, color }]) => (
              <Pressable key={valor} onPress={() => setCategoria(valor)}>
                <View style={{ opacity: categoria === valor ? 1 : 0.4 }}>
                  <Pill color={color}>{texto}</Pill>
                </View>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>DATOS DEL CLIENTE</ThemedText>
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder={esEmpresa ? 'Nombre de la empresa' : 'Nombre del cliente'}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <TextInput
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Teléfono"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
            <View style={styles.filaSwitch}>
              <ThemedText type="small">Es empresa</ThemedText>
              <Switch value={esEmpresa} onValueChange={setEsEmpresa} />
            </View>
            {esEmpresa && (
              <TextInput
                value={nif}
                onChangeText={setNif}
                placeholder="NIF/CIF"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
              />
            )}
            {yaPagado ? (
              precio && (
                <ThemedText type="small" themeColor="textSecondary">
                  Precio cobrado: {precio} € (ya pagado, no editable)
                </ThemedText>
              )
            ) : (
              <TextInput
                value={precio}
                onChangeText={setPrecio}
                placeholder="Precio (€)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
              />
            )}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>FECHA DE ENTREGA</ThemedText>
          <Pressable onPress={() => setMostrarCalendario((v) => !v)} style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={!fecha ? { color: theme.textSecondary } : undefined}>
              {fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Toca para elegir un día en el calendario'}
            </ThemedText>
          </Pressable>
          {mostrarCalendario && (
            <SelectorFechaCalendario
              fechaSeleccionada={fecha || null}
              onSeleccionar={(iso) => {
                setFecha(iso);
                setMostrarCalendario(false);
              }}
            />
          )}

          {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

          <View style={styles.botonWrap}>
            <BotonPrimario texto="✅ Confirmar ficha" onPress={confirmarFicha} cargando={guardando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// AsuntoPedidoWeb (réplica de /panel/avisos/pedido-web/{locator}) se quitó el
// 2026-08-27 -- auditoría de bases de datos: nunca estuvo enganchada a ninguna
// pantalla real de la app, y solo escribía la fecha en local/calendario, nunca en
// la web de verdad (su propia UI ya lo avisaba: "esto no cambia el pedido en la
// web"). Confirmar/mover la fecha de una solicitud hoy pasa por SolicitudDetalle.

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  ficha: { marginTop: Spacing.two },
  seccion: { marginTop: Spacing.three, marginBottom: Spacing.two, letterSpacing: 0.3 },
  chipsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  nota: { lineHeight: 18 },
  formCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  inputMultilinea: { minHeight: 70, textAlignVertical: 'top' },
  error: { marginTop: Spacing.one },
  botonWrap: { marginTop: Spacing.two },
});
