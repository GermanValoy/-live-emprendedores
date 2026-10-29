"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { alServidor } from "@/lib/red";
import { cortarVivo } from "./acciones";

export type FilaVivo = { id: string; handle: string; name: string; desde: string; viewers: number };

export function PanelVivos({ vivos }: { vivos: FilaVivo[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cortar = (id: string) =>
    iniciar(async () => {
      const r = await alServidor(() => cortarVivo(id));
      if (!r.ok) toast.error(r.error);
      setConfirmando(null);
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">Vivos ahora</h2>
      {vivos.length === 0 ? (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">No hay nadie en vivo</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vivos.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{v.name}</p>
                <p className="break-all text-sm text-muted-foreground">@{v.handle}</p>
                <p className="text-xs text-muted-foreground">
                  Desde {v.desde} · 👁 {v.viewers}
                </p>
              </div>
              {confirmando === v.id ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">¿Cortamos el vivo de @{v.handle}?</p>
                  <div className="flex gap-2">
                    <Button className="min-h-11 flex-1" variant="destructive" disabled={pendiente} onClick={() => cortar(v.id)}>
                      Sí, cortar
                    </Button>
                    <Button className="min-h-11 flex-1" variant="secondary" disabled={pendiente} onClick={() => setConfirmando(null)}>
                      No
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="min-h-11" variant="outline" disabled={pendiente} onClick={() => setConfirmando(v.id)}>
                  Cortar este vivo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
