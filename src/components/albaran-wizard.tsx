/** Asistente de generar albarán -- mismos pasos y mismo backend real que el asistente
 * del panel web (/panel/pedidos/nuevo-albaran): elegir cliente, añadir líneas del
 * catálogo, (si es Grand Folies) referencia del pedido, previsualizar, y finalizar.
 *
 * "Finalizar" es un punto de no retorno real: consume la numeración siempre, y si se
 * confirma "registrar", descuenta stock de verdad en Grocy y escribe en la
 * contabilidad -- por eso hay una confirmación explícita antes, aparte del botón. */

import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListCard, ListRow, SectionLabel } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import {
  anadirLineaAlbaran,
  crearClienteProfesional,
  finalizarAlbaran,
  iniciarAlbaran,
  mensajeError,
  obtenerClientesParaAlbaran,
  obtenerEstadoAlbaran,
  ponerFechaEntregaAlbaran,
  ponerReferenciaAlbaran,
  previsualizarAlbaran,
  quitarLineaAlbaran,
  urlDescargarAlbaran,
  type CatalogoItem,
  type EstadoAlbaran,
  type PrevisualizacionAlbaran,
  type ResultadoAlbaran,
} from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

type Paso = 'cliente' | 'catalogo' | 'anadir' | 'referencia' | 'previsualizar' | 'finalizando' | 'hecho';

export function AlbaranWizard({ onVolver }: { onVolver: () => void }) {
  const theme = useTheme();
  const [paso, setPaso] = useState<Paso>('cliente');
  const [sesion, setSesion] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAlbaran | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionAlbaran | null>(null);
  const [resultado, setResultado] = useState<ResultadoAlbaran | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const [itemEnEdicion, setItemEnEdicion] = useState<CatalogoItem | null>(null);
  const [unidadesTexto, setUnidadesTexto] = useState('');
  const [precioTexto, setPrecioTexto] = useState('');
  const [pideProecio, setPideProecio] = useState(false);
  const [referenciaTexto, setReferenciaTexto] = useState('');
  const [fechaEntregaTexto, setFechaEntregaTexto] = useState('');
  const [numeroManual, setNumeroManual] = useState('');
  const [usarNumeroManual, setUsarNumeroManual] = useState(false);

  // Botón/gesto de "atrás" de Android -- retrocede un paso en vez de salir directo a
  // Pedidos (bug real: Ariadna, 2026-08-23).
  useVolverAtras(paso === 'cliente', () => {
    if (paso === 'hecho') return onVolver();
    if (paso === 'catalogo') return setPaso('cliente');
    setPaso('catalogo');
  });

  const [clientes, setClientes] = useState<{ nombre: string }[] | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDireccion, setNuevoDireccion] = useState('');
  const [nuevoCif, setNuevoCif] = useState('');

  async function cargarClientes() {
    setCargando(true);
    setError(null);
    try {
      setClientes(await obtenerClientesParaAlbaran());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  if (paso === 'cliente' && clientes === null && !cargando && !error) {
    cargarClientes();
  }

  async function elegirCliente(cliente: string) {
    setCargando(true);
    setError(null);
    try {
      const nuevaSesion = await iniciarAlbaran(cliente);
      setSesion(nuevaSesion);
      const est = await obtenerEstadoAlbaran(nuevaSesion);
      setEstado(est);
      setPaso('catalogo');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function crearYElegirCliente() {
    if (!nuevoNombre.trim()) {
      setError('Falta el nombre del cliente.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await crearClienteProfesional(nuevoNombre.trim(), nuevoDireccion.trim(), nuevoCif.trim(), 'directa');
      await elegirCliente(nuevoNombre.trim());
    } catch (err) {
      setError(mensajeError(err));
      setCargando(false);
    }
  }

  async function refrescarEstado(sesionActual: string) {
    setEstado(await obtenerEstadoAlbaran(sesionActual));
  }

  function abrirAnadir(item: CatalogoItem) {
    setItemEnEdicion(item);
    setUnidadesTexto('');
    setPrecioTexto('');
    setPideProecio(false);
    setPaso('anadir');
  }

  async function confirmarAnadirLinea() {
    if (!sesion || !itemEnEdicion) return;
    const unidades = Number(unidadesTexto.replace(',', '.'));
    if (!unidades || unidades <= 0) {
      setError('Pon un número de unidades válido.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const precio = pideProecio ? Number(precioTexto.replace(',', '.')) : undefined;
      if (pideProecio && (!precio || precio <= 0)) {
        setError('Pon un precio válido.');
        setCargando(false);
        return;
      }
      const resp = await anadirLineaAlbaran(sesion, itemEnEdicion.descripcion, unidades, itemEnEdicion.codigo, precio);
      if (resp.falta_precio) {
        setPideProecio(true);
        setCargando(false);
        return;
      }
      await refrescarEstado(sesion);
      setItemEnEdicion(null);
      setPaso('catalogo');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function quitarLinea(indice: number) {
    if (!sesion) return;
    setCargando(true);
    try {
      await quitarLineaAlbaran(sesion, indice);
      await refrescarEstado(sesion);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function irAPrevisualizar() {
    if (!sesion || !estado) return;
    if (estado.lineas.length === 0) {
      setError('Añade al menos una línea antes de continuar.');
      return;
    }
    if (estado.es_grand_folies && paso !== 'referencia') {
      setPaso('referencia');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setPrevisualizacion(await previsualizarAlbaran(sesion));
      setPaso('previsualizar');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function confirmarReferencia() {
    if (!sesion) return;
    setCargando(true);
    setError(null);
    try {
      if (referenciaTexto.trim()) await ponerReferenciaAlbaran(sesion, referenciaTexto.trim());
      if (fechaEntregaTexto.trim()) await ponerFechaEntregaAlbaran(sesion, fechaEntregaTexto.trim());
      setPrevisualizacion(await previsualizarAlbaran(sesion));
      setPaso('previsualizar');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function pedirConfirmacionFinal() {
    Alert.alert(
      'Generar albarán definitivo',
      'Esto consume el número de albarán, descuenta el stock real en Grocy y se apunta en la contabilidad. No se puede deshacer desde la app. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Generar', style: 'destructive', onPress: finalizar },
      ],
    );
  }

  async function finalizar() {
    if (!sesion) return;
    setPaso('finalizando');
    setError(null);
    try {
      const numero = usarNumeroManual ? numeroManual.trim() : null;
      const resp = await finalizarAlbaran(sesion, numero, true);
      setResultado(resp);
      setPaso('hecho');
    } catch (err) {
      setError(mensajeError(err));
      setPaso('previsualizar');
    }
  }

  async function descargar(tipo: 'docx' | 'pdf') {
    if (!sesion) return;
    try {
      const token = tokenStore.getAccessToken();
      const destino = new File(Paths.cache, `albaran-${sesion}.${tipo}`);
      const archivo = await File.downloadFileAsync(urlDescargarAlbaran(sesion, tipo), destino, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        idempotent: true,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(archivo.uri);
      }
    } catch {
      setError('No se ha podido descargar el documento.');
    }
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
          <ThemedText type="title" style={styles.titulo}>
            Nuevo albarán
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {paso === 'cliente' && (
            <>
              <SectionLabel>¿Para qué cliente es?</SectionLabel>
              {cargando && <ActivityIndicator color={theme.accent} />}
              {clientes && (
                <ListCard>
                  {clientes.map((c, i) => (
                    <ListRow key={c.nombre} last={i === clientes.length - 1} onPress={() => elegirCliente(c.nombre)} title={c.nombre} />
                  ))}
                </ListCard>
              )}

              <SectionLabel>Cliente nuevo</SectionLabel>
              <View style={[styles.fichaClienteNuevo, { backgroundColor: theme.backgroundElement }]}>
                <Campo etiqueta="Nombre" valor={nuevoNombre} onCambiar={setNuevoNombre} />
                <Campo etiqueta="Dirección" valor={nuevoDireccion} onCambiar={setNuevoDireccion} />
                <Campo etiqueta="CIF/NIF" valor={nuevoCif} onCambiar={setNuevoCif} />
              </View>
              <View style={styles.botonesFila}>
                <BotonPrimario texto="Empezar con este cliente" onPress={crearYElegirCliente} cargando={cargando} />
              </View>
            </>
          )}

          {paso === 'catalogo' && estado && (
            <>
              {!!estado.lineas.length && (
                <>
                  <SectionLabel>Líneas añadidas</SectionLabel>
                  <ListCard>
                    {estado.lineas.map((l, i) => (
                      <ListRow
                        key={`${l.descripcion}-${i}`}
                        last={i === estado.lineas.length - 1}
                        onPress={() => quitarLinea(i)}
                        title={l.descripcion}
                        subtitle={`${l.unidades} ud × ${eur.format(l.precio_unitario)} -- toca para quitar`}
                        right={<ThemedText type="smallBold">{eur.format(l.unidades * l.precio_unitario)}</ThemedText>}
                      />
                    ))}
                  </ListCard>
                </>
              )}
              <SectionLabel>{`Catálogo de ${estado.cliente}`}</SectionLabel>
              <ListCard>
                {estado.catalogo.map((item, i) => (
                  <ListRow key={`${item.descripcion}-${i}`} last={i === estado.catalogo.length - 1} onPress={() => abrirAnadir(item)} title={item.descripcion} />
                ))}
              </ListCard>
              <View style={styles.botonesFila}>
                <BotonPrimario texto="Continuar" onPress={irAPrevisualizar} cargando={cargando} disabled={estado.lineas.length === 0} />
              </View>
            </>
          )}

          {paso === 'anadir' && itemEnEdicion && (
            <>
              <SectionLabel>{itemEnEdicion.descripcion}</SectionLabel>
              <Campo etiqueta="Unidades" valor={unidadesTexto} onCambiar={setUnidadesTexto} teclado="decimal-pad" />
              {pideProecio && (
                <>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.avisoPrecio}>
                    ℹ️ No hay precio conocido para este producto y este cliente -- ponlo a mano.
                  </ThemedText>
                  <Campo etiqueta="Precio unitario (€)" valor={precioTexto} onCambiar={setPrecioTexto} teclado="decimal-pad" />
                </>
              )}
              <View style={styles.botonesFila}>
                <Pressable onPress={() => setPaso('catalogo')} style={styles.botonSecundario}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Cancelar
                  </ThemedText>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <BotonPrimario texto="Añadir" onPress={confirmarAnadirLinea} cargando={cargando} />
                </View>
              </View>
            </>
          )}

          {paso === 'referencia' && (
            <>
              <SectionLabel>Referencia del pedido (Grand Folies)</SectionLabel>
              <Campo etiqueta="Referencia" valor={referenciaTexto} onCambiar={setReferenciaTexto} />
              <Campo etiqueta="Fecha de entrega (YYYY-MM-DD)" valor={fechaEntregaTexto} onCambiar={setFechaEntregaTexto} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.notaFechaEntrega}>
                Se usa para calcular la caducidad del lote (entrega + 7 días). Si la dejas en blanco, se calcula desde hoy.
              </ThemedText>
              <View style={styles.botonesFila}>
                <BotonPrimario texto="Continuar" onPress={confirmarReferencia} cargando={cargando} />
              </View>
            </>
          )}

          {paso === 'previsualizar' && previsualizacion && (
            <>
              <SectionLabel>Resumen</SectionLabel>
              <ListCard>
                {previsualizacion.lineas.map((l, i) => (
                  <ListRow
                    key={`${l.descripcion}-${i}`}
                    last={i === previsualizacion.lineas.length - 1}
                    title={l.descripcion}
                    subtitle={`${l.unidades} ud${l.receta ? ` · receta: ${l.receta}` : ''}`}
                    right={<ThemedText type="smallBold">{eur.format(l.importe)}</ThemedText>}
                  />
                ))}
              </ListCard>
              <View style={[styles.totales, { backgroundColor: theme.backgroundElement }]}>
                <FilaTotal etiqueta="Subtotal" valor={eur.format(previsualizacion.subtotal)} />
                <FilaTotal etiqueta="IVA" valor={eur.format(previsualizacion.iva)} />
                <FilaTotal etiqueta="Total" valor={eur.format(previsualizacion.total)} destacado />
              </View>

              {!!previsualizacion.faltantes.length && (
                <View style={[styles.avisoFaltantes, { backgroundColor: theme.warningSoft }]}>
                  <ThemedText type="small" style={{ color: theme.warningText, fontWeight: '700' }}>
                    ⚠️ Puede faltar materia prima:
                  </ThemedText>
                  {previsualizacion.faltantes.map((f) => (
                    <ThemedText key={f.producto} type="small" style={{ color: theme.warningText }}>
                      {f.producto}: faltan {f.falta}
                    </ThemedText>
                  ))}
                </View>
              )}

              <SectionLabel>Número de albarán</SectionLabel>
              <Pressable onPress={() => setUsarNumeroManual(false)} style={styles.opcionNumero}>
                <ThemedText type="small">{!usarNumeroManual ? '● ' : '○ '}Automático ({previsualizacion.siguiente_numero_automatico})</ThemedText>
              </Pressable>
              <Pressable onPress={() => setUsarNumeroManual(true)} style={styles.opcionNumero}>
                <ThemedText type="small">{usarNumeroManual ? '● ' : '○ '}Elegir a mano</ThemedText>
              </Pressable>
              {usarNumeroManual && <Campo etiqueta="Número" valor={numeroManual} onCambiar={setNumeroManual} />}

              <View style={styles.botonesFila}>
                <BotonPrimario texto="Generar albarán" onPress={pedirConfirmacionFinal} cargando={false} />
              </View>
            </>
          )}

          {paso === 'finalizando' && (
            <View style={styles.centro}>
              <ActivityIndicator color={theme.accent} size="large" />
              <ThemedText type="small" themeColor="textSecondary">
                Generando albarán...
              </ThemedText>
            </View>
          )}

          {paso === 'hecho' && resultado && (
            <>
              <View style={[styles.hecho, { backgroundColor: theme.successSoft }]}>
                <ThemedText type="smallBold" style={{ color: theme.success }}>
                  ✅ Albarán {resultado.numero_mostrado} generado
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                  {resultado.resumen}
                </ThemedText>
              </View>
              {resultado.ruta_docx && <BotonPrimario texto="⬇️ Descargar Word" onPress={() => descargar('docx')} />}
              {resultado.ruta_pdf && !resultado.pdf_fallo && (
                <View style={{ marginTop: Spacing.two }}>
                  <BotonPrimario texto="⬇️ Descargar PDF" onPress={() => descargar('pdf')} />
                </View>
              )}
              <Pressable onPress={onVolver} style={styles.botonSecundario}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Volver a Pedidos
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FilaTotal({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <View style={styles.filaTotal}>
      <ThemedText type={destacado ? 'smallBold' : 'small'} themeColor={destacado ? undefined : 'textSecondary'}>
        {etiqueta}
      </ThemedText>
      <ThemedText type={destacado ? 'smallBold' : 'small'}>{valor}</ThemedText>
    </View>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambiar,
  teclado,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  teclado?: 'decimal-pad';
}) {
  const theme = useTheme();
  return (
    <View style={styles.campo}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        keyboardType={teclado}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one },
  error: { lineHeight: 20 },
  filaTituloPaso: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  fichaClienteNuevo: { borderRadius: 16, paddingHorizontal: Spacing.three },
  tipoFacturacionFila: { marginTop: Spacing.one },
  radioFila: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 8 },
  radioCirculo: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 10, height: 10, borderRadius: 5 },
  botonesFila: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  notaFechaEntrega: { lineHeight: 18, marginTop: -Spacing.one },
  botonSecundario: { alignItems: 'center', paddingVertical: Spacing.three },
  campo: { gap: Spacing.one, marginTop: Spacing.two },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  avisoPrecio: { lineHeight: 18, marginTop: Spacing.two },
  totales: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one, marginTop: Spacing.two },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between' },
  avisoFaltantes: { borderRadius: 14, padding: Spacing.three, marginTop: Spacing.two, gap: 2 },
  opcionNumero: { paddingVertical: Spacing.one },
  centro: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.six },
  hecho: { borderRadius: 16, padding: Spacing.three, marginBottom: Spacing.two },
});
