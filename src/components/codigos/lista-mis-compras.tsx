"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PanelPago } from "@/components/codigos/panel-pago";
import { useMisPedidos } from "@/components/codigos/use-mis-pedidos";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { restante } from "@/lib/codigos/pedido";
import type { Pedido } from "@/lib/codigos/tipos";
import { formatARS } from "@/lib/format/plata";
import { formatFechaTucuman } from "@/lib/format/fecha";
import type { OpcionEntrega } from "@/lib/tiendas/tipos";

export type CodigoDeCompra = { label: string; photo_path: string | null };
export type PuestoDeCompra = { name: string; handle: string; zone: string; entregas: OpcionEntrega[] };

type Props = {
  userId: string;
  /** Los pedidos que ya había al abrir la página (después siguen al día por Realtime). */
  inicial: Pedido[];
  codigos: Record<string, CodigoDeCompra>;
  puestos: Record<string, PuestoDeCompra>;
};

const BOTON =
  "flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-[0.97]";

function Cuenta({ deadline }: { deadline: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{`Tenés ${restante(deadline, ahora).texto} para pagar`}</>;
}

const ENTREGA: Record<string, string> = { pickup: "Retiro", shipping: "Envío", meetup: "Punto de encuentro" };

function Estado({ pedido, puesto }: { pedido: Pedido; puesto: string }) {
  switch (pedido.status) {
    case "por_pagar":
      return <b className="text-primary" suppressHydrationWarning><Cuenta deadline={pedido.deadline} /></b>;
    case "pago_informado":
      return <b>Esperando confirmación</b>;
    case "en_revision":
      return (
        <>
          <b>En revisión</b>
          <span className="block text-muted-foreground">{`${puesto} no encuentra tu pago. Te va a escribir por WhatsApp para aclararlo.`}</span>
        </>
      );
    case "pagado":
      return (
        <>
          <b className="text-exito">Pagado</b>
          {pedido.delivery_kind && <span className="block text-muted-foreground">{`Entrega: ${ENTREGA[pedido.delivery_kind]}`}</span>}
        </>
      );
    case "vencido":
      return <b>Vencido</b>;
    default:
      return <b>Anulado</b>;
  }
}

/** Todos los pedidos de la compradora, el más nuevo arriba, con su estado. */
export function ListaMisCompras({ userId, inicial, codigos, puestos }: Props) {
  const router = useRouter();
  const enVivo = useMisPedidos(userId);
  // Hasta que Realtime lee por primera vez, vale lo que trajo el servidor.
  const pedidos = enVivo.length > 0 ? enVivo : inicial;
  const [abierto, setAbierto] = useState<string | null>(null);

  // Un pedido nuevo (de un puesto o código que la página aún no conoce): se vuelve a pedir la página al servidor.
  const faltan = pedidos.filter((p) => !codigos[p.code_id] || !puestos[p.store_id]).map((p) => p.id).join(",");
  const yaPedidos = useRef("");
  useEffect(() => {
    if (faltan && yaPedidos.current !== faltan) { yaPedidos.current = faltan; router.refresh(); }
  }, [faltan, router]);

  if (pedidos.length === 0) return <EstadoVacio texto="Cuando ganes un código, lo vas a ver acá." />;

  const pedidoAbierto = pedidos.find((p) => p.id === abierto) ?? null;
  const puestoAbierto = pedidoAbierto ? puestos[pedidoAbierto.store_id] : null;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {pedidos.map((p) => {
          const codigo = codigos[p.code_id];
          const puesto = puestos[p.store_id];
          const apagado = p.status === "vencido" || p.status === "anulado";
          const accion = p.status === "por_pagar" ? "Ver datos para pagar" : p.status === "pagado" ? "Ver datos de entrega" : null;
          return (
            <li
              key={p.id}
              data-estado={p.status}
              className={`flex flex-col gap-3 rounded-2xl border border-border p-3 ${apagado ? "bg-muted text-muted-foreground" : "bg-card"}`}
            >
              <div className="flex items-center gap-3">
                {codigo?.photo_path ? (
                  <Foto path={codigo.photo_path} tamano="chica" alt="" className={`size-16 shrink-0 rounded-xl object-cover ${apagado ? "grayscale" : ""}`} />
                ) : (
                  <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-xl bg-accent text-2xl">🛍️</span>
                )}
                <p className="min-w-0 flex-1 text-sm leading-tight">
                  <b className="block truncate text-base">{codigo?.label ?? "Pedido"}</b>
                  <span className="block truncate">{puesto?.name ?? ""}</span>
                  <span className="block text-xs text-muted-foreground">{formatFechaTucuman(p.created_at)}</span>
                </p>
                <b className="text-lg tabular-nums">{formatARS(p.total_cents)}</b>
              </div>
              <p className="text-sm"><Estado pedido={p} puesto={puesto?.name ?? "La feriante"} /></p>
              {accion && puesto && (
                <button type="button" onClick={() => setAbierto(p.id)} className={`${BOTON} ${p.status === "por_pagar" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {accion}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {pedidoAbierto && puestoAbierto && (
        <PanelPago
          key={pedidoAbierto.id}
          pedido={pedidoAbierto}
          tienda={{ name: puestoAbierto.name, zone: puestoAbierto.zone }}
          opciones={puestoAbierto.entregas}
          codigo={codigos[pedidoAbierto.code_id] ?? null}
          alCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}
