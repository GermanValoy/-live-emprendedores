"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { darPrenda } from "@/app/mi-puesto/vivo/acciones-codigos";
import { Foto } from "@/components/fotos/foto";
import { prendasLibres } from "@/lib/codigos/prendas";
import type { Codigo } from "@/lib/codigos/tipos";
import { formatARS } from "@/lib/format/plata";
import { alServidor } from "@/lib/red";

/** A quién se le da la prenda: el mensaje que tocó la feriante y quien lo escribió. */
export type Destinataria = { mensajeId: string; userId: string; nombre: string };

type Props = {
  destinataria: Destinataria;
  codigos: Codigo[];
  alCerrar(): void;
};

/** Las prendas sin vender de códigos anteriores. Sube desde abajo; un toque la da. */
export function PanelDarPrenda({ destinataria, codigos, alCerrar }: Props) {
  const [dando, setDando] = useState(false);
  const prendas = prendasLibres(codigos);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);

  async function dar(c: Codigo) {
    setDando(true);
    const r = await alServidor(() => darPrenda(c.id, destinataria.mensajeId, { nombre: destinataria.nombre, etiqueta: c.label }));
    if (r.ok) toast.success("texto" in r && r.texto ? r.texto : `Le diste el ${c.label} a ${destinataria.nombre}.`);
    else toast.error(r.error);
    alCerrar();
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-end bg-black/60" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dar-prenda-titulo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full flex-col gap-2 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-foreground motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
      >
        <p id="dar-prenda-titulo" className="text-lg font-extrabold">{`¿Qué prenda le das a ${destinataria.nombre}?`}</p>
        {prendas.length === 0 && (
          <p className="text-sm text-muted-foreground">No quedan prendas sin vender de códigos anteriores.</p>
        )}
        {prendas.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={dando}
            onClick={() => void dar(c)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-secondary p-2 pr-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-safe:active:scale-[0.98]"
          >
            {c.photo_path ? (
              <Foto path={c.photo_path} tamano="chica" alt="" className="size-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <span aria-hidden="true" className="size-12 shrink-0 rounded-xl bg-muted" />
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-lg font-extrabold">{c.label}</b>
              <span className="block text-sm text-muted-foreground">{`${formatARS(c.price_cents)} · Quedan ${c.quantity - c.sold}`}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={alCerrar}
          autoFocus
          className="min-h-12 rounded-full text-base font-bold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
