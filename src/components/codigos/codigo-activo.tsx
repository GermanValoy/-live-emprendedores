"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { anularCodigo, anularReclamo, cerrarCodigo } from "@/app/mi-puesto/vivo/acciones-codigos";
import type { Codigo, Reclamo } from "@/lib/codigos/tipos";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/client";

type Vista = "cerrada" | "menu" | "anular" | "ganadoras";
type Respuesta = { ok: true } | { ok: false; error: string };

const CAMPOS_RECLAMO = "id, code_id, user_id, buyer_name, message_id, message_body, claimed_at, status";

/** La barra con el código que está vendiendo ahora y su menú (cerrar, anular, ver quién lo ganó). */
export function CodigoActivo({ codigo, alCambiar }: { codigo: Codigo; alCambiar(): Promise<void> }) {
  const [vista, setVista] = useState<Vista>("cerrada");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agotado = codigo.sold >= codigo.quantity;

  async function hacer(accion: () => Promise<Respuesta>, cerrar = true) {
    setTrabajando(true);
    setError(null);
    const r = await accion().catch((e: unknown): Respuesta => {
      console.error("Código activo: no respondió el servidor", e);
      return { ok: false, error: "No se pudo completar. Revisá tu conexión y probá de nuevo." };
    });
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await alCambiar();
    if (cerrar) setVista("cerrada");
  }

  return (
    <>
      <div className="pointer-events-auto flex min-h-14 items-center gap-2 rounded-2xl bg-black/65 py-1.5 pr-1.5 pl-3 backdrop-blur animate-in fade-in duration-(--duracion-base)">
        <p className="min-w-0 flex-1 text-sm leading-tight">
          <span className="block truncate font-extrabold">
            {`Código ${codigo.label} · ${agotado ? "Agotado" : `${codigo.sold} de ${codigo.quantity} vendidos`}`}
          </span>
          <span className="block text-xs font-semibold text-white/85">{formatARS(codigo.price_cents)}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setVista("menu");
          }}
          aria-label="Opciones del código"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-white/70"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>

      {/* Se dibuja aparte (en el body): la barra vive en un rincón de la pantalla y el menú tiene que tapar todo. */}
      {vista !== "cerrada" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end bg-black/60 text-foreground">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Código ${codigo.label}`}
            className="flex max-h-[85dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] animate-in slide-in-from-bottom duration-(--duracion-sheet) ease-out"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">{`Código ${codigo.label}`}</h2>
              <button type="button" onClick={() => setVista("cerrada")} aria-label="Cerrar el menú" className="flex size-11 items-center justify-center rounded-full bg-secondary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            {error && <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>}

            {vista === "menu" && (
              <>
                <OpcionMenu onClick={() => void hacer(() => cerrarCodigo(codigo.id))} disabled={trabajando}>Cerrar código</OpcionMenu>
                <OpcionMenu onClick={() => setVista("ganadoras")}>Ver quién lo ganó</OpcionMenu>
                <OpcionMenu onClick={() => setVista("anular")} peligro>Anular código</OpcionMenu>
              </>
            )}

            {vista === "anular" && (
              <>
                <p className="text-sm text-muted-foreground">Se anulan los reclamos y los pedidos sin pagar de este código. No se puede deshacer.</p>
                <OpcionMenu onClick={() => void hacer(() => anularCodigo(codigo.id))} disabled={trabajando} peligro>Sí, anular código</OpcionMenu>
                <OpcionMenu onClick={() => setVista("menu")}>Volver</OpcionMenu>
              </>
            )}

            {vista === "ganadoras" && (
              <Ganadoras
                codigoId={codigo.id}
                trabajando={trabajando}
                alAnular={(id) => hacer(() => anularReclamo(id), false)}
                alVolver={() => setVista("menu")}
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function OpcionMenu({ children, onClick, disabled, peligro }: { children: string; onClick(): void; disabled?: boolean; peligro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-12 w-full rounded-full text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 ${peligro ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}`}
    >
      {children}
    </button>
  );
}

function Ganadoras({ codigoId, trabajando, alAnular, alVolver }: {
  codigoId: string;
  trabajando: boolean;
  alAnular(id: string): Promise<void>;
  alVolver(): void;
}) {
  const [supabase] = useState(createClient);
  const [reclamos, setReclamos] = useState<Reclamo[] | null>(null);

  const leer = useCallback(async () => {
    const { data, error } = await supabase
      .from("claims")
      .select(CAMPOS_RECLAMO)
      .eq("code_id", codigoId)
      .in("status", ["ganadora", "espera"])
      .order("claimed_at");
    if (error) {
      console.error("Leer los reclamos del código", error);
      return;
    }
    setReclamos(data as Reclamo[]);
  }, [supabase, codigoId]);

  useEffect(() => {
    // La primera lectura la hace el canal apenas se conecta (SUBSCRIBED).
    let cerrando = false;
    const canal = supabase
      .channel(`reclamos:${codigoId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "claims", filter: `code_id=eq.${codigoId}` }, () => void leer())
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") void leer();
        else if (estado === "CLOSED" && !cerrando) console.error("Reclamos: se cerró el canal");
      });
    return () => {
      cerrando = true;
      void supabase.removeChannel(canal);
    };
  }, [supabase, codigoId, leer]);

  return (
    <>
      {reclamos === null ? (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      ) : reclamos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no lo reclamó nadie.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reclamos.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3">
              <p className="min-w-0 text-sm">
                <span className="block truncate font-bold">{r.buyer_name}</span>
                <span className="text-xs text-muted-foreground">{r.status === "ganadora" ? "Ganó" : "En la lista de espera"}</span>
              </p>
              <button
                type="button"
                onClick={() => void alAnular(r.id).then(leer)}
                disabled={trabajando}
                className="min-h-11 shrink-0 rounded-full bg-destructive/10 px-4 text-sm font-bold text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                Anular reclamo
              </button>
            </li>
          ))}
        </ul>
      )}
      <OpcionMenu onClick={alVolver}>Volver</OpcionMenu>
    </>
  );
}
