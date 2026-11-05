"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatFechaTucuman } from "@/lib/format/fecha";
import { alServidor } from "@/lib/red";
import { quitarSilencioPlataforma, silenciarEnPlataforma, ultimosMensajes } from "./acciones";

export type FilaCuenta = { userId: string; nombre: string; salas: number; desde: string; enPlataforma: boolean };

type Mensajes = Extract<Awaited<ReturnType<typeof ultimosMensajes>>, { ok: true }>["mensajes"];

export function PanelCuentas({ cuentas }: { cuentas: FilaCuenta[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensajes | null>(null);

  const verMensajes = (id: string) => {
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    setMensajes(null);
    iniciar(async () => {
      const r = await alServidor(() => ultimosMensajes(id));
      if (r.ok) setMensajes(r.mensajes);
      else {
        toast.error(r.error);
        setAbierta(null);
      }
    });
  };

  const cambiar = (id: string, silenciar: boolean) =>
    iniciar(async () => {
      const r = await alServidor(() => (silenciar ? silenciarEnPlataforma(id) : quitarSilencioPlataforma(id)));
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">Cuentas para revisar</h2>
      {cuentas.length === 0 ? (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">No hay cuentas para revisar.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cuentas.map((c) => (
            <li key={c.userId} className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{c.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Silenciada en {c.salas} {c.salas === 1 ? "sala" : "salas"} · desde {c.desde}
                </p>
                {c.enPlataforma && <p className="text-xs font-semibold">Silenciada en toda la plataforma</p>}
              </div>
              <Button className="min-h-11" variant="outline" onClick={() => verMensajes(c.userId)}>
                {abierta === c.userId ? "Ocultar mensajes" : "Ver mensajes"}
              </Button>
              {abierta === c.userId &&
                (mensajes === null ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : mensajes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin mensajes.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {mensajes.map((m, i) => (
                      <li key={i} className="rounded-lg bg-muted p-2 text-sm">
                        <p className="break-words">{m.body}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.tienda} · {formatFechaTucuman(m.created_at)}
                          {m.deleted && <span className="ml-2 font-semibold">borrado</span>}
                          {m.hidden_reason && <span className="ml-2 font-semibold">oculto ({m.hidden_reason})</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                ))}
              <Button
                className="min-h-11"
                variant={c.enPlataforma ? "secondary" : "destructive"}
                disabled={pendiente}
                onClick={() => cambiar(c.userId, !c.enPlataforma)}
              >
                {c.enPlataforma ? "Quitar silencio de la plataforma" : "Silenciar en toda la plataforma"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
