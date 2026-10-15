"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarEntregas } from "@/app/mi-puesto/acciones";
import { formatARS } from "@/lib/format/plata";
import { alServidor } from "@/lib/red";
import type { DatosPrivados, EntregasEntrada, ModoEnvio, OpcionEntrega } from "@/lib/tiendas/tipos";

type Props = {
  zona: string;
  opciones: OpcionEntrega[];
  privados: DatosPrivados | null;
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioEntregas({ zona, opciones, privados, avanzarA, textoBoton, alGuardar }: Props) {
  const de = (kind: OpcionEntrega["kind"]) => opciones.find((o) => o.kind === kind);
  const envio = de("shipping");
  const [entrada, setEntrada] = useState<EntregasEntrada>({
    pickup: { enabled: de("pickup")?.enabled ?? false, address: privados?.pickup_address ?? "", hours: privados?.pickup_hours ?? "" },
    shipping: {
      enabled: envio?.enabled ?? false,
      mode: envio?.shipping_mode ?? "fixed",
      cost: envio?.shipping_cost_cents ? formatARS(envio.shipping_cost_cents).replace("$", "") : "",
      note: envio?.note ?? "",
    },
    meetup: { enabled: de("meetup")?.enabled ?? false, note: de("meetup")?.note ?? "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiar = <K extends keyof EntregasEntrada>(k: K, v: Partial<EntregasEntrada[K]>) =>
    setEntrada((e) => ({ ...e, [k]: { ...e[k], ...v } }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          setError(null);
          const r = await alServidor(() => guardarEntregas(entrada, avanzarA));
          if (!r.ok) return setError(r.error);
          alGuardar();
        });
      }}
    >
      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.pickup.enabled} onChange={(e) => cambiar("pickup", { enabled: e.target.checked })} />
          Retiro en mi domicilio
        </label>
        {entrada.pickup.enabled && (
          <>
            <p className="text-xs text-muted-foreground">En tu tienda se ve &quot;Retiro en {zona}&quot;. 🔒 La dirección solo la ve quien ya pagó.</p>
            <label htmlFor="pickup_address" className="text-sm font-semibold">Dirección</label>
            <Input id="pickup_address" value={entrada.pickup.address} maxLength={120} onChange={(e) => cambiar("pickup", { address: e.target.value })} />
            <label htmlFor="pickup_hours" className="text-sm font-semibold">Horarios (opcional)</label>
            <Input id="pickup_hours" value={entrada.pickup.hours} maxLength={80} placeholder="Lun. a vie. de 17 a 20 h" onChange={(e) => cambiar("pickup", { hours: e.target.value })} />
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.shipping.enabled} onChange={(e) => cambiar("shipping", { enabled: e.target.checked })} />
          Envío
        </label>
        {entrada.shipping.enabled && (
          <>
            {(
              [
                ["fixed", "Con costo fijo"],
                ["free", "Gratis"],
                ["arrange", "A coordinar"],
              ] as [ModoEnvio, string][]
            ).map(([modo, texto]) => (
              <label key={modo} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="shipping_mode" className="size-5" checked={entrada.shipping.mode === modo} onChange={() => cambiar("shipping", { mode: modo })} />
                {texto}
              </label>
            ))}
            {entrada.shipping.mode === "fixed" && (
              <>
                <label htmlFor="shipping_cost" className="text-sm font-semibold">Costo del envío</label>
                <Input id="shipping_cost" inputMode="decimal" value={entrada.shipping.cost} placeholder="2.500" onChange={(e) => cambiar("shipping", { cost: e.target.value })} />
              </>
            )}
            <label htmlFor="shipping_note" className="text-sm font-semibold">Aclaración (opcional)</label>
            <Input id="shipping_note" value={entrada.shipping.note} maxLength={80} placeholder="Solo Gran San Miguel" onChange={(e) => cambiar("shipping", { note: e.target.value })} />
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.meetup.enabled} onChange={(e) => cambiar("meetup", { enabled: e.target.checked })} />
          Punto de encuentro
        </label>
        {entrada.meetup.enabled && (
          <>
            <label htmlFor="meetup_note" className="text-sm font-semibold">¿Dónde?</label>
            <Input id="meetup_note" value={entrada.meetup.note} maxLength={80} placeholder="Plaza Independencia, a coordinar" onChange={(e) => cambiar("meetup", { note: e.target.value })} />
          </>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
