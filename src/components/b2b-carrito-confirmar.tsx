/** Revisar un pedido B2B hecho por un cliente desde su carrito privado en la web
 * (ver ninuma-agente, corre solo -- este componente solo confirma o descarta un
 * borrador ya creado). Mismo modelo que GrandFoliesConfirmar, con una diferencia:
 * aquí la fecha de entrega la fija Ariadna al confirmar (Grand Folies a veces ya
 * la trae del correo), así que lleva su propio selector de calendario.
 * El grueso de la pantalla vive en AlbaranConfirmarBase, compartido con
 * GrandFoliesConfirmar -- ver ese archivo para el porqué. */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AlbaranConfirmarBase } from '@/components/albaran-confirmar-base';
import { SelectorFechaCalendario } from '@/components/selector-fecha-calendario';
import { ThemedText } from '@/components/themed-text';
import { SectionLabel } from '@/components/ui/panel';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmarB2BCarrito, descartarB2BCarrito, type PedidoB2BCarrito } from '@/lib/api';

export function B2BCarritoConfirmar({ pedido, onVolver, onResuelto }: { pedido: PedidoB2BCarrito; onVolver: () => void; onResuelto: () => void }) {
  const theme = useTheme();
  // Si el cliente pidió una fecha al hacer el pedido, se prellena aquí -- Ariadna
  // sigue pudiendo tocarla para cambiarla antes de confirmar (Ariadna, 2026-08-26).
  const [fecha, setFecha] = useState<string | null>(pedido.fecha_entrega ?? pedido.fecha_solicitada);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  return (
    <AlbaranConfirmarBase
      onVolver={onVolver}
      onResuelto={onResuelto}
      titulo={`Pedido B2B — ${pedido.cliente}`}
      subtitulo={pedido.ya_pagado ? 'Comprado por la tienda online -- ya cobrado' : 'Pedido desde el carrito privado'}
      banner={
        pedido.ya_pagado ? (
          <View style={[styles.avisoPagado, { backgroundColor: theme.successSoft }]}>
            <ThemedText type="small" style={{ color: theme.success, fontWeight: '700' }}>
              ✅ Ya cobrado por Stripe -- al confirmar se marca cobrado directamente, no hace falta cobrarlo aparte.
            </ThemedText>
          </View>
        ) : undefined
      }
      lineasIniciales={pedido.lineas}
      faltantes={pedido.faltantes}
      seccionExtra={
        <>
          <SectionLabel>Fecha de entrega</SectionLabel>
          {fecha && fecha === pedido.fecha_solicitada && !pedido.fecha_entrega && (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: -Spacing.one, marginBottom: Spacing.one }}>
              📅 Es la fecha que pidió el cliente -- toca para cambiarla si quieres otra.
            </ThemedText>
          )}
          <Pressable onPress={() => setMostrarCalendario((v) => !v)} style={[styles.formCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={!fecha ? { color: theme.textSecondary } : undefined}>
              {fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Toca para elegir un día en el calendario'}
            </ThemedText>
          </Pressable>
          {mostrarCalendario && (
            <SelectorFechaCalendario
              fechaSeleccionada={fecha}
              onSeleccionar={(iso) => {
                setFecha(iso);
                setMostrarCalendario(false);
              }}
            />
          )}
        </>
      }
      tituloConfirmarAlert="Confirmar pedido B2B"
      // Nada impedía confirmar (generar el albarán real, irreversible) sin haber
      // fijado antes la fecha de entrega -- a diferencia de Grand Folies, aquí la
      // fecha nace en blanco y es Ariadna quien la pone al confirmar (bug real,
      // revisión de código 2026-08-25).
      validarAntesDeConfirmar={() => (fecha ? null : 'Elige un día en el calendario antes de confirmar este pedido.')}
      confirmarDeshabilitado={!fecha}
      confirmar={(numeroManual, lineas) => confirmarB2BCarrito(pedido.id, fecha, numeroManual, lineas)}
      descartar={() => descartarB2BCarrito(pedido.id)}
      sesion={pedido.id}
      prefijoDescarga="b2b-carrito"
    />
  );
}

const styles = StyleSheet.create({
  avisoPagado: { borderRadius: 12, padding: Spacing.two, marginTop: Spacing.two },
  formCard: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
});
