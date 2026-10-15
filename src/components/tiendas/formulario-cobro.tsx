"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarCobro } from "@/app/mi-puesto/acciones";

type Props = {
  inicial?: { payment_alias: string | null; payment_holder: string | null };
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioCobro({ inicial, avanzarA, textoBoton, alGuardar }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          setError(null);
          const r = await guardarCobro(
            { payment_alias: String(fd.get("payment_alias") ?? ""), payment_holder: String(fd.get("payment_holder") ?? "") },
            avanzarA,
          );
          if (!r.ok) return setError(r.error);
          alGuardar();
        });
      }}
    >
      <p className="rounded-xl bg-accent p-3 text-sm">🔒 Solo lo ve quien te compra.</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="payment_alias" className="font-semibold">Alias</label>
        <Input id="payment_alias" name="payment_alias" required autoCapitalize="none" defaultValue={inicial?.payment_alias ?? ""} placeholder="mica.ropa.yb" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="payment_holder" className="font-semibold">Titular</label>
        <Input id="payment_holder" name="payment_holder" required defaultValue={inicial?.payment_holder ?? ""} placeholder="Micaela Díaz" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
