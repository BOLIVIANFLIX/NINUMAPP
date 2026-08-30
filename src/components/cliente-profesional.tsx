import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPrimario } from '@/components/boton-primario';
import { DocumentoDetalle } from '@/components/documento-detalle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Dot, Ficha, FilaFicha, ListCard, ListRow } from '@/components/ui/panel';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVolverAtras } from '@/hooks/use-volver-atras';
import {
  crearProductoCatalogo,
  editarClienteProfesional,
  editarProductoCatalogo,
  eliminarProductoCatalogo,
  mensajeError,
  obtenerCatalogoCliente,
  obtenerClienteDetalle,
  type ProductoCatalogo,
} from '@/lib/api';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

type Vista = { tipo: 'detalle' } | { tipo: 'editar' } | { tipo: 'documento'; numeros: string[]; indice: number };

// Réplica de /panel/clientes/{nombre} (+ /editar) -- ficha, historial de albaranes
// (tocar uno abre DocumentoDetalle) y productos con último precio.
export function ClienteProfesionalDetalle({ nombre, onVolver }: { nombre: string; onVolver: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>({ tipo: 'detalle' });
  useVolverAtras(vista.tipo === 'detalle', () => setVista({ tipo: 'detalle' }));
  const { data, isLoading, isFetching, refetch, error } = useQuery({ queryKey: ['cliente-profesional', nombre], queryFn: () => obtenerClienteDetalle(nombre) });

  if (vista.tipo === 'documento') {
    const { numeros, indice } = vista;
    return (
      <DocumentoDetalle
        numero={numeros[indice]}
        etiquetaVolver={nombre}
        onVolver={() => setVista({ tipo: 'detalle' })}
        onAnterior={indice > 0 ? () => setVista({ tipo: 'documento', numeros, indice: indice - 1 }) : undefined}
        onSiguiente={indice < numeros.length - 1 ? () => setVista({ tipo: 'documento', numeros, indice: indice + 1 }) : undefined}
      />
    );
  }

  if (vista.tipo === 'editar' && data) {
    return (
      <ClienteProfesionalEditar
        nombre={nombre}
        cliente={data.cliente}
        onCancelar={() => setVista({ tipo: 'detalle' })}
        onGuardado={() => {
          queryClient.invalidateQueries({ queryKey: ['cliente-profesional', nombre] });
          queryClient.invalidateQueries({ queryKey: ['clientes-profesionales'] });
          setVista({ tipo: 'detalle' });
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={theme.accent} />}>
          <Pressable onPress={onVolver}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Clientes
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            {nombre}
          </ThemedText>

          {isLoading && <ActivityIndicator color={theme.accent} style={styles.centro} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {mensajeError(error)}
            </ThemedText>
          )}

          {data && (
            <>
              <Ficha style={styles.ficha}>
                <FilaFicha etiqueta="Dirección" valor={data.cliente.direccion || '—'} />
                <FilaFicha etiqueta="CIF" valor={data.cliente.cif || '—'} />
                <FilaFicha etiqueta="Facturación" valor={data.cliente.tipo_facturacion === 'mensual' ? 'Mensual acumulada' : 'Directa por pedido'} last />
              </Ficha>
              <Pressable onPress={() => setVista({ tipo: 'editar' })} style={styles.enlaceEditar}>
                <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700' }}>
                  ✏️ Editar datos
                </ThemedText>
              </Pressable>

              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                ALBARANES
              </ThemedText>
              {data.albaranes.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sin albaranes registrados.
                </ThemedText>
              ) : (
                <ListCard>
                  {data.albaranes.map((a, i) => (
                    <ListRow
                      key={a.numero}
                      last={i === data.albaranes.length - 1}
                      onPress={() => setVista({ tipo: 'documento', numeros: data.albaranes.map((x) => x.numero), indice: i })}
                      left={<Dot color={a.cobrado ? 'success' : 'warning'} />}
                      title={a.numero}
                      // Ariadna, 2026-08-29: "los tres pone pendiente, no hay diferencia entre
                      // ellos... solo puedo verlo si entro albarán por albarán" -- "pendiente"
                      // salía tanto del estado de entrega como del de cobro, y el de facturación
                      // no se veía en ningún sitio de esta lista. Los tres pasos reales, de un
                      // vistazo, sin tener que entrar en cada uno. Ariadna, 2026-08-30:
                      // con las tres palabras completas la línea no cabía en el ancho de
                      // pantalla y "Cobrado" se partía solo a la línea de abajo --
                      // abreviado a una letra por estado (E/F/C) para que quepa siempre
                      // en una sola línea junto con la fecha.
                      subtitle={`${fecha.format(new Date(a.creado_en))} · E${a.estado === 'entregado' ? '✅' : '⬜'} F${a.facturado ? '✅' : '⬜'} C${a.cobrado ? '✅' : '⬜'}`}
                    />
                  ))}
                </ListCard>
              )}

              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
                PRODUCTOS Y ÚLTIMO PRECIO
              </ThemedText>
              {data.productos.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sin historial de productos.
                </ThemedText>
              ) : (
                <ListCard>
                  {data.productos.map((p, i) => (
                    <ListRow
                      key={`${p.codigo}-${p.descripcion}`}
                      last={i === data.productos.length - 1}
                      title={p.descripcion}
                      right={<ThemedText type="smallBold">{p.ultimo_precio != null ? eur.format(p.ultimo_precio) : '—'}</ThemedText>}
                    />
                  ))}
                </ListCard>
              )}

              <CatalogoPrecios nombre={nombre} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Precio propio de este cliente para cada producto -- el mismo producto puede tener
// un precio distinto en otro cliente (ver db.catalogo_cliente): es el precio de
// referencia que se ofrece primero en el asistente de nuevo albarán.
function CatalogoPrecios({ nombre }: { nombre: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['catalogo-cliente', nombre], queryFn: () => obtenerCatalogoCliente(nombre) });
  const [editando, setEditando] = useState<ProductoCatalogo | 'nuevo' | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo-cliente', nombre] });
  }

  if (editando) {
    return (
      <ProductoCatalogoForm
        cliente={nombre}
        producto={editando === 'nuevo' ? null : editando}
        onCancelar={() => setEditando(null)}
        onGuardado={() => {
          invalidar();
          setEditando(null);
        }}
      />
    );
  }

  return (
    <>
      <View style={styles.filaSeccion}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccionSinMargen}>
          CATÁLOGO DE PRECIOS
        </ThemedText>
        <Pressable onPress={() => setEditando('nuevo')}>
          <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700' }}>＋ Añadir</ThemedText>
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.notaCatalogo}>
        Precio propio de {nombre} para cada producto -- el mismo producto puede tener otro precio en otro cliente.
      </ThemedText>

      {isLoading && <ActivityIndicator color={theme.accent} />}
      {error && <ThemedText type="small" themeColor="danger">{mensajeError(error)}</ThemedText>}
      {data?.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">Todavía no hay productos en el catálogo de este cliente.</ThemedText>
      )}
      {!!data?.length && (
        <ListCard>
          {data.map((p, i) => (
            <ListRow
              key={p.id}
              last={i === data.length - 1}
              onPress={() => setEditando(p)}
              title={p.descripcion}
              subtitle={p.codigo ? `Código: ${p.codigo}` : null}
              right={<ThemedText type="smallBold">{eur2.format(p.precio)}</ThemedText>}
            />
          ))}
        </ListCard>
      )}
    </>
  );
}

function ProductoCatalogoForm({
  cliente,
  producto,
  onCancelar,
  onGuardado,
}: {
  cliente: string;
  producto: ProductoCatalogo | null;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const theme = useTheme();
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [codigo, setCodigo] = useState(producto?.codigo ?? '');
  const [precio, setPrecio] = useState(producto ? String(producto.precio) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const valor = parseFloat(precio.replace(',', '.'));
    if (!descripcion.trim() || Number.isNaN(valor) || valor < 0) {
      setError('Falta descripción o el precio no es válido.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (producto) await editarProductoCatalogo(producto.id, descripcion.trim(), valor, codigo || null);
      else await crearProductoCatalogo(cliente, descripcion.trim(), valor, codigo || null);
      onGuardado();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminar() {
    if (!producto) return;
    Alert.alert('¿Eliminar este producto del catálogo?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarProductoCatalogo(producto.id);
          onGuardado();
        },
      },
    ]);
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
      <Campo etiqueta="Descripción" valor={descripcion} onCambiar={setDescripcion} />
      <Campo etiqueta="Código (opcional)" valor={codigo} onCambiar={setCodigo} />
      <Campo etiqueta="Precio €" valor={precio} onCambiar={setPrecio} last />

      {error && <ThemedText type="small" themeColor="danger" style={styles.error}>{error}</ThemedText>}

      <View style={styles.filaBotonesForm}>
        <Pressable onPress={onCancelar} style={styles.botonCancelar}>
          <ThemedText type="small" themeColor="textSecondary">Cancelar</ThemedText>
        </Pressable>
        {producto && (
          <Pressable onPress={eliminar} style={styles.botonCancelar}>
            <ThemedText type="small" style={{ color: theme.danger }}>Eliminar</ThemedText>
          </Pressable>
        )}
      </View>
      <BotonPrimario texto="Guardar" onPress={guardar} cargando={guardando} />
    </View>
  );
}

function ClienteProfesionalEditar({
  nombre,
  cliente,
  onCancelar,
  onGuardado,
}: {
  nombre: string;
  cliente: { direccion: string | null; cif: string | null; nombre_documento: string | null; tipo_facturacion: string };
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const theme = useTheme();
  const [direccion, setDireccion] = useState(cliente.direccion ?? '');
  const [cif, setCif] = useState(cliente.cif ?? '');
  const [nombreDocumento, setNombreDocumento] = useState(cliente.nombre_documento ?? '');
  const [tipoFacturacion, setTipoFacturacion] = useState(cliente.tipo_facturacion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await editarClienteProfesional(nombre, direccion, cif, nombreDocumento || null, tipoFacturacion);
      onGuardado();
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
          <Pressable onPress={onCancelar}>
            <ThemedText type="link" themeColor="textSecondary">
              ← Cancelar (no guarda nada)
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>
            Editar cliente
          </ThemedText>

          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <Campo etiqueta="Dirección" valor={direccion} onCambiar={setDireccion} />
            <Campo etiqueta="CIF/NIF" valor={cif} onCambiar={setCif} />
            <Campo etiqueta="Nombre en el documento (si es distinto)" valor={nombreDocumento} onCambiar={setNombreDocumento} last />
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.seccion}>
            FACTURACIÓN
          </ThemedText>
          <RadioFila etiqueta="Directa por pedido" seleccionado={tipoFacturacion !== 'mensual'} onPress={() => setTipoFacturacion('directa')} />
          <RadioFila etiqueta="Mensual acumulada" seleccionado={tipoFacturacion === 'mensual'} onPress={() => setTipoFacturacion('mensual')} />

          {error && (
            <ThemedText type="small" themeColor="danger" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <View style={styles.botonGuardar}>
            <BotonPrimario texto="Guardar cambios" onPress={guardar} cargando={guardando} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function RadioFila({ etiqueta, seleccionado, onPress }: { etiqueta: string; seleccionado: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.radioFila}>
      <View style={[styles.radioCirculo, { borderColor: seleccionado ? theme.accent : theme.separator }]}>
        {seleccionado && <View style={[styles.radioRelleno, { backgroundColor: theme.accent }]} />}
      </View>
      <ThemedText type="small">{etiqueta}</ThemedText>
    </Pressable>
  );
}

function Campo({ etiqueta, valor, onCambiar, last }: { etiqueta: string; valor: string; onCambiar: (v: string) => void; last?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.campo, !last && { borderBottomWidth: 1, borderBottomColor: theme.separator }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput value={valor} onChangeText={onCambiar} style={[styles.input, { color: theme.text }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: BottomTabInset },
  scroll: { padding: Spacing.four, gap: Spacing.one },
  titulo: { fontSize: 26, lineHeight: 31, marginTop: Spacing.one, marginBottom: Spacing.two },
  centro: { marginTop: Spacing.five },
  ficha: { marginBottom: 0 },
  enlaceEditar: { marginTop: Spacing.one, marginBottom: Spacing.two },
  seccion: { marginTop: Spacing.four, marginBottom: Spacing.two, letterSpacing: 0.3 },
  formCard: { borderRadius: 16, paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  campo: { paddingVertical: Spacing.two, gap: 2 },
  input: { fontSize: 16, paddingVertical: 4 },
  radioFila: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 8 },
  radioCirculo: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 10, height: 10, borderRadius: 5 },
  error: { marginTop: Spacing.two },
  botonGuardar: { marginTop: Spacing.four },
  filaSeccion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.four, marginBottom: Spacing.one },
  seccionSinMargen: { letterSpacing: 0.3 },
  notaCatalogo: { marginBottom: Spacing.two, lineHeight: 18 },
  filaBotonesForm: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two, paddingBottom: Spacing.two },
  botonCancelar: { paddingVertical: Spacing.one },
});
