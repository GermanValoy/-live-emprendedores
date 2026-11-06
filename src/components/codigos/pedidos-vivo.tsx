"use client";

import { useState } from "react";
import { confirmarPago, darMasTiempo, ofrecerAOtra, rechazarPago, urlComprobante } from "@/app/mi-puesto/pedidos/acciones";
import { Foto } from "@/components/fotos/foto";
import type { Pedido } from "@/lib/codigos/tipos";
import { formatFechaTucuman } from "@/lib/format/fecha";
import { formatARS } from "@/lib/format/plata";
import { alServidor } from "@/lib/red";
import { type CodigoDePedido, usePedidosPuesto } from "./use-pedidos-puesto";

const BOTON =
  "flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-safe:active:scale-[0.97]";
const ENTREGA: Record<string, string> = { pickup: "Retiro", shipping: "Envío", meetup: "Punto de encuentro" };
const ESTADO: Record<Pedido["status"], string> = {
  por_pagar: "Por pagar",
  pago_informado: "Avisó que pagó",
  en_revision: "En revisión",
  pagado: "Pagado",
  vencido: "Vencido",
  anulado: "Anulado",
};

/** El link para escribirle a la compradora: con 10 dígitos es un celular argentino sin el 54 9. */
export function linkWhatsapp(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  return digitos.length === 10 ? `https://wa.me/549${digitos}` : `https://wa.me/${digitos}`;
}

type Resultado = { ok: true } | { ok: false; error: string };

function FilaPedido({ pedido, codigo }: { pedido: Pedido; codigo: CodigoDePedido | undefined }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masTiempo, setMasTiempo] = useState(false);
  const [comprobante, setComprobante] = useState<string | null>(null);

  async function hacer(accion: () => Promise<Resultado>) {
    setTrabajando(true);
    setError(null);
    const r = await alServidor(accion);
    setTrabajando(false);
    if (!r.ok) setError(r.error);
    else setMasTiempo(false);
  }

  async function verComprobante() {
    setTrabajando(true);
    setError(null);
    const r = await alServidor(() => urlComprobante(pedido.id));
    setTrabajando(false);
    if (!r.ok) setError(r.error);
    else if ("url" in r) setComprobante(r.url);
  }

  const apagado = pedido.status === "vencido" || pedido.status === "anulado";
  const puedeConfirmar = pedido.status === "pago_informado" || pedido.status === "en_revision";
  return (
    <li data-estado={pedido.status} className={`flex flex-col gap-2 rounded-2xl border border-border p-3 ${apagado ? "bg-muted text-muted-foreground" : "bg-card text-card-foreground"}`}>
      <div className="flex items-center gap-3">
        {codigo?.photo_path ? (
          <Foto path={codigo.photo_path} tamano="chica" alt="" className={`size-14 shrink-0 rounded-xl object-cover ${apagado ? "grayscale" : ""}`} />
        ) : (
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-xl bg-accent text-xl">🛍️</span>
        )}
        <p className="min-w-0 flex-1 text-sm leading-tight">
          <b className="block truncate text-base">{codigo?.label ?? "Prenda"}</b>
          <span className="block">{pedido.delivery_kind ? ENTREGA[pedido.delivery_kind] : "Entrega sin elegir"}</span>
          <b className="block">{ESTADO[pedido.status]}</b>
        </p>
        <b className="text-lg tabular-nums">{formatARS(pedido.total_cents)}</b>
      </div>

      {pedido.reported_at && (
        <button type="button" disabled={trabajando} onClick={() => void verComprobante()} className={`${BOTON} self-start bg-secondary text-secondary-foreground`}>
          Ver comprobante
        </button>
      )}

      {(puedeConfirmar || pedido.status === "por_pagar") && (
        <div className="flex flex-wrap gap-2">
          {puedeConfirmar && (
            <button type="button" disabled={trabajando} onClick={() => void hacer(() => confirmarPago(pedido.id))} className={`${BOTON} bg-primary text-primary-foreground`}>
              Confirmar pago
            </button>
          )}
          {pedido.status === "pago_informado" && (
            <button type="button" disabled={trabajando} onClick={() => void hacer(() => rechazarPago(pedido.id))} className={`${BOTON} bg-secondary text-secondary-foreground`}>
              No me llegó el pago
            </button>
          )}
          {pedido.status === "por_pagar" && (
            <button type="button" disabled={trabajando} aria-expanded={masTiempo} onClick={() => setMasTiempo((v) => !v)} className={`${BOTON} bg-secondary text-secondary-foreground`}>
              Darle más tiempo
            </button>
          )}
          {pedido.status !== "pago_informado" && (
            <button type="button" disabled={trabajando} onClick={() => void hacer(() => ofrecerAOtra(pedido.id))} className={`${BOTON} border border-border bg-background text-foreground`}>
              Ofrecer a otra
            </button>
          )}
        </div>
      )}
      {masTiempo && pedido.status === "por_pagar" && (
        <div className="flex flex-wrap gap-2">
          {[[15, "+15 min"], [60, "+1 hora"], [1440, "+24 horas"]].map(([min, texto]) => (
            <button key={min} type="button" disabled={trabajando} onClick={() => void hacer(() => darMasTiempo(pedido.id, min as number))} className={`${BOTON} bg-accent text-accent-foreground`}>
              {texto}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}

      {comprobante && (
        <div role="dialog" aria-modal="true" aria-label="Comprobante" className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- link firmado de 60 segundos: no pasa por el optimizador de imágenes */}
          <img src={comprobante} alt="Comprobante de pago" className="max-h-[80dvh] max-w-full rounded-xl object-contain" />
          <button type="button" autoFocus onClick={() => setComprobante(null)} className={`${BOTON} bg-white text-primary`}>
            Cerrar
          </button>
        </div>
      )}
    </li>
  );
}

type Grupo = { compradora: string; nombre: string; whatsapp: string | null; pedidos: Pedido[] };

function agruparPorCompradora(pedidos: Pedido[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const p of pedidos) {
    const g = grupos.get(p.buyer_id) ?? { compradora: p.buyer_id, nombre: p.buyer_name, whatsapp: null, pedidos: [] };
    g.pedidos.push(p);
    g.whatsapp ??= p.buyer_whatsapp;
    grupos.set(p.buyer_id, g);
  }
  return [...grupos.values()];
}

function Compradoras({ pedidos, codigos }: { pedidos: Pedido[]; codigos: Record<string, CodigoDePedido> }) {
  return (
    <ul className="flex flex-col gap-3">
      {agruparPorCompradora(pedidos).map((g) => (
        <li key={g.compradora} className="flex flex-col gap-2 rounded-3xl bg-background/60 p-2 text-foreground">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="min-w-0 truncate text-base font-extrabold">{g.nombre}</h3>
            {g.whatsapp && (
              <a href={linkWhatsapp(g.whatsapp)} target="_blank" rel="noreferrer" className={`${BOTON} shrink-0 bg-exito text-white`}>
                WhatsApp
              </a>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {g.pedidos.map((p) => <FilaPedido key={p.id} pedido={p} codigo={codigos[p.code_id]} />)}
          </ul>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  storeId: string;
  /** Con vivo: solo sus pedidos. Sin vivo: todos los del puesto, agrupados por vivo. */
  vivoId?: string;
  titulo?: string;
};

/** Los pedidos del puesto agrupados por compradora, con lo que la feriante puede hacer con cada uno. */
export function PedidosVivo({ storeId, vivoId, titulo }: Props) {
  const { pedidos, codigos, vivos, cargado } = usePedidosPuesto(storeId, vivoId);

  const porVivo = new Map<string, Pedido[]>();
  if (!vivoId) for (const p of pedidos) porVivo.set(p.live_session_id, [...(porVivo.get(p.live_session_id) ?? []), p]);
  const ordenados = [...porVivo.entries()].sort(([a], [b]) => (vivos[b]?.started_at ?? "").localeCompare(vivos[a]?.started_at ?? ""));

  return (
    <section className="flex flex-col gap-3">
      {titulo && <h2 className="text-2xl font-extrabold">{titulo}</h2>}
      <p className="rounded-2xl bg-accent p-3 text-sm font-semibold text-accent-foreground">
        Antes de confirmar, revisá en tu banco que la plata haya llegado. Las capturas se pueden falsificar.
      </p>
      {cargado && pedidos.length === 0 && <p className="rounded-2xl bg-background/60 p-4 text-sm text-foreground">Todavía no hay pedidos.</p>}
      {vivoId ? (
        <Compradoras pedidos={pedidos} codigos={codigos} />
      ) : (
        ordenados.map(([id, lista]) => (
          <div key={id} className="flex flex-col gap-2" data-vivo={id}>
            <h2 className="text-lg font-extrabold">{vivos[id] ? `Vivo del ${formatFechaTucuman(vivos[id].started_at)}` : "Vivo"}</h2>
            <Compradoras pedidos={lista} codigos={codigos} />
          </div>
        ))
      )}
    </section>
  );
}
