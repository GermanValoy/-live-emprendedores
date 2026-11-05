"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { alServidor } from "@/lib/red";
import { quitarSilencio } from "./vivo/acciones";

export type FilaSilenciada = { userId: string; nombre: string; desde: string };

export function PersonasSilenciadas({ storeId, filas }: { storeId: string; filas: FilaSilenciada[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const quitar = (userId: string) =>
    iniciar(async () => {
      const r = await alServidor(() => quitarSilencio(storeId, userId));
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });

  return (
    <section aria-labelledby="titulo-silenciadas" className="flex flex-col gap-2">
      <h2 id="titulo-silenciadas" className="text-lg font-bold">Personas silenciadas</h2>
      {filas.length === 0 ? (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">No silenciaste a nadie.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={f.userId} className="flex items-center justify-between gap-2 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{f.nombre}</p>
                <p className="text-xs text-muted-foreground">desde {f.desde}</p>
              </div>
              <Button className="min-h-11 shrink-0" variant="outline" disabled={pendiente} onClick={() => quitar(f.userId)}>
                Quitar silencio
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
