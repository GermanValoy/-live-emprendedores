"use client";

import { useState, useTransition } from "react";
import { guardarPlazoDePago } from "@/app/mi-puesto/acciones";
import { Button } from "@/components/ui/button";
import { alServidor } from "@/lib/red";
import { PLAZOS_DE_PAGO, TEXTO_PLAZO } from "@/lib/tiendas/plazo";

/** Cuánto tiempo tiene quien gana un código para pagar. Sin elegir uno propio, vale el plazo general de la plataforma (`general`, que llega del servidor). */
export function FormularioPlazo({ inicial, general, alGuardar }: { inicial: number | null; general: number; alGuardar: () => void }) {
  const [minutos, setMinutos] = useState<number | null>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          setError(null);
          const r = await alServidor(() => guardarPlazoDePago(minutos));
          if (!r.ok) return setError(r.error);
          alGuardar();
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Plazo para pagar</legend>
        <p className="text-sm text-muted-foreground">Cuánto tiempo tiene quien gana un código para pagarte. Si no paga, pasa a la siguiente.</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <input type="radio" name="plazo" value="general" checked={minutos === null} onChange={() => setMinutos(null)} className="sr-only" />
            {`Plazo general (${general} min)`}
          </label>
          {PLAZOS_DE_PAGO.map((m) => (
            <label
              key={m}
              className="flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="radio" name="plazo" value={m} checked={minutos === m} onChange={() => setMinutos(m)} className="sr-only" />
              {TEXTO_PLAZO[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={pendiente}>Guardar plazo</Button>
    </form>
  );
}
