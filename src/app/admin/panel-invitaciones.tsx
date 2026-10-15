"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anularInvitacion, crearInvitacion } from "./acciones";

export type FilaInvitacion = {
  id: string;
  note: string | null;
  estado: "Pendiente" | "Usada" | "Vencida" | "Anulada";
  usadaPor: string | null;
  creada: string;
};

export function PanelInvitaciones({ filas }: { filas: FilaInvitacion[] }) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const crear = () =>
    iniciar(async () => {
      setError(null);
      const r = await crearInvitacion(nota);
      if (!r.ok) return setError(r.error);
      setLink(`${window.location.origin}/invitacion/${r.token}`);
      setNota("");
      router.refresh();
    });

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border p-4">
        <label htmlFor="nota" className="font-semibold">¿Para quién es? (opcional)</label>
        <Input id="nota" value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} placeholder="Mica, ropa usada" />
        <Button onClick={crear} disabled={pendiente}>Crear invitación</Button>
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        {link && (
          <div className="flex flex-col gap-2 rounded-xl bg-accent p-3">
            <p data-testid="link-invitacion" className="break-all text-sm">{link}</p>
            <Button variant="secondary" onClick={copiar}>Copiar link</Button>
            <p className="text-xs text-muted-foreground">Sirve una sola vez y vence en 7 días.</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Invitaciones creadas</h2>
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="flex-1">
                <p className="font-semibold">{f.note ?? "Sin nota"}</p>
                <p className="text-xs text-muted-foreground">
                  {f.creada} · {f.estado}
                  {f.usadaPor ? ` por @${f.usadaPor}` : ""}
                </p>
              </div>
              {f.estado === "Pendiente" && (
                <Button
                  variant="ghost"
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await anularInvitacion(f.id);
                      if (!r.ok) toast.error(r.error);
                      router.refresh();
                    })
                  }
                >
                  Anular
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
