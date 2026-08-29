/** Revisar un pedido de Grand Folies detectado por email (ver ninuma-agente,
 * corre solo -- este componente solo confirma o descarta un borrador ya creado).
 * Confirmar reutiliza el mismo camino que generar un albarán normal (descuento de
 * stock real, contabilidad, documento) -- mismo aviso de punto de no retorno.
 * El grueso de la pantalla (líneas, totales, número de albarán, confirmar/descartar,
 * resultado+descarga) vive en AlbaranConfirmarBase, compartido con
 * B2BCarritoConfirmar -- ver ese archivo para el porqué. */

import { AlbaranConfirmarBase } from '@/components/albaran-confirmar-base';
import { confirmarGrandFolies, descartarGrandFolies, type PedidoGrandFolies } from '@/lib/api';

export function GrandFoliesConfirmar({
  pedido,
  onVolver,
  onResuelto,
  onConfirmado,
}: {
  pedido: PedidoGrandFolies;
  onVolver: () => void;
  onResuelto: () => void;
  onConfirmado?: () => void;
}) {
  return (
    <AlbaranConfirmarBase
      onVolver={onVolver}
      onResuelto={onResuelto}
      onConfirmado={onConfirmado}
      titulo="Pedido Grand Folies"
      subtitulo={`${pedido.numero_pedido ?? 'Sin número'} · entrega ${pedido.fecha_entrega ?? 'sin fecha'}`}
      lineasIniciales={pedido.lineas}
      faltantes={pedido.faltantes}
      tituloConfirmarAlert="Confirmar pedido de Grand Folies"
      confirmar={(numeroManual, lineas) => confirmarGrandFolies(pedido.id, pedido.fecha_entrega, pedido.numero_pedido, numeroManual, lineas)}
      descartar={() => descartarGrandFolies(pedido.id)}
      sesion={pedido.id}
      prefijoDescarga="grand-folies"
    />
  );
}
