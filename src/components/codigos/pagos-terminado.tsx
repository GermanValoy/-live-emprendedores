"use client";

import Link from "next/link";
import { PagosSala } from "@/components/codigos/pagos-sala";
import { useCodigosVivo } from "@/components/codigos/use-codigos-vivo";
import { useMisPedidos } from "@/components/codigos/use-mis-pedidos";
import type { Codigo } from "@/lib/codigos/tipos";
import type { OpcionEntrega } from "@/lib/tiendas/tipos";

type Props = {
  vivoId: string;
  userId: string | null;
  iniciales: Codigo[];
  tienda: { name: string; zone: string };
  entregas: OpcionEntrega[];
};

/**
 * Lo que sigue disponible cuando el vivo ya terminó: la feriante suele cortar mientras las ganadoras copian el alias,
 * así que el panel de pago (y el botón para volver a abrirlo) siguen, y un link a Mis compras.
 */
export function PagosTerminado({ vivoId, userId, iniciales, tienda, entregas }: Props) {
  const { codigos } = useCodigosVivo(vivoId, iniciales);
  const tienePedido = useMisPedidos(userId).some((p) => p.live_session_id === vivoId);
  if (!userId) return null;
  return (
    <>
      {tienePedido && (
        <Link
          href="/mis-compras"
          className="flex min-h-11 items-center justify-center rounded-full bg-codigo px-4 text-center text-sm font-extrabold text-black outline-none focus-visible:ring-3 focus-visible:ring-white/70"
        >
          Tenés un pedido de este vivo → Mis compras
        </Link>
      )}
      <PagosSala vivoId={vivoId} userId={userId} codigos={codigos} tienda={tienda} entregas={entregas} />
    </>
  );
}
