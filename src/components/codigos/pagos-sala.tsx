"use client";

import { useState } from "react";
import { PanelPago } from "@/components/codigos/panel-pago";
import { useMisPedidos } from "@/components/codigos/use-mis-pedidos";
import type { Codigo, EstadoPedido } from "@/lib/codigos/tipos";
import type { OpcionEntrega } from "@/lib/tiendas/tipos";

/** Estados que abren el panel solos cuando cambian (para que la compradora no se pierda lo importante). */
const ABREN: EstadoPedido[] = ["por_pagar", "pagado", "en_revision"];

type Props = {
  vivoId: string;
  userId: string | null;
  codigos: Codigo[];
  tienda: { name: string; zone: string };
  entregas: OpcionEntrega[];
};

/**
 * El panel "¡Ganaste!" de la sala. Lo mueven los pedidos de la compradora en este vivo (no el mensaje del chat),
 * así también aparece si una prenda le llega después desde la lista de espera.
 */
export function PagosSala({ vivoId, userId, codigos, tienda, entregas }: Props) {
  const pedidos = useMisPedidos(userId).filter((p) => p.live_session_id === vivoId);
  const [estado, setEstado] = useState<{ vistos: Record<string, string>; abierto: string | null; festejados: string[] }>({
    vistos: {}, abierto: null, festejados: [],
  });

  // Se ajusta al dibujar, sin efectos: un pedido por pagar nuevo abre el panel; un pedido ya visto, solo si cambia a algo importante.
  const cambios = pedidos.filter((p) => estado.vistos[p.id] !== p.status);
  if (cambios.length > 0) {
    const vistos = { ...estado.vistos };
    let abierto = estado.abierto;
    for (const p of cambios) {
      const eraNuevo = vistos[p.id] === undefined;
      vistos[p.id] = p.status;
      if (ABREN.includes(p.status) && (p.status === "por_pagar" || !eraNuevo)) abierto = p.id;
    }
    setEstado({ ...estado, vistos, abierto });
  }

  const pedido = pedidos.find((p) => p.id === estado.abierto) ?? null;
  const porPagar = pedidos.find((p) => p.status === "por_pagar") ?? null;
  const codigoDe = (id: string) => codigos.find((c) => c.id === id) ?? null;

  if (pedido) {
    const festejar = !estado.festejados.includes(pedido.id);
    return (
      <PanelPago
        key={pedido.id}
        pedido={pedido}
        tienda={tienda}
        opciones={entregas}
        codigo={codigoDe(pedido.code_id)}
        festejar={festejar}
        alCerrar={() => setEstado((e) => ({ ...e, abierto: null, festejados: [...e.festejados, pedido.id] }))}
      />
    );
  }
  if (!porPagar) return null;
  // Cerró el panel sin pagar: un botón para volver a abrirlo.
  return (
    <button
      type="button"
      onClick={() => setEstado((e) => ({ ...e, abierto: porPagar.id }))}
      className="pointer-events-auto flex min-h-11 w-fit items-center rounded-full bg-codigo px-4 text-sm font-extrabold text-black outline-none focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]"
    >
      {`Pagar ${codigoDe(porPagar.code_id)?.label ?? "tu código"}`}
    </button>
  );
}
